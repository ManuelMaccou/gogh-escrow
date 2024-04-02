const ethers = require("ethers5");
const goghContractAbi = require("./assets/gogh-contract.abi.json");
const GoghUtils = require("./gogh-utils.js");
const Gogh = require("./gogh.js");
const Mongo = require("./mongo.js");
const IpService = require("./ip.js");
const logger = require("./logger.js");

const {
  ENABLE_SSL,
  PORT,
  SUBSIDIZE_RELEASE_ESCROW_GAS_FEE,
  RELEASE_ESCROW_GAS_SUBSIDY_HOST_PRIVATE_KEY,
  BASE_ALCHEMY_API,
  GOGH_CONTRACT_ADDRESS,
} = process.env;
const sslEnabled = ENABLE_SSL === "1";
const releaseEscrowGasSubsidizer = RELEASE_ESCROW_GAS_SUBSIDY_HOST_PRIVATE_KEY;
const susidizeReleaseEscrowGas = SUBSIDIZE_RELEASE_ESCROW_GAS_FEE === "1";
const gogh = new Gogh();
const goghUtils = new GoghUtils();
const mongoClient = new Mongo();
const ipService = new IpService();
gogh.startServer(PORT, sslEnabled === false);
const serverHandler = gogh.serverSecured;

const storeAnalytics = (userAgentData) => {};

const getUserAnalytics = (request) => {
  const ip = (
    req.headers["x-forwarded-for"] || request.socket.remoteAddress
  ).replace("::ffff:", "");
  let userAgentIs = (useragent) => {
    let r = [];
    for (let i in useragent) if (useragent[i] === true) r.push(i);
    return r;
  };
  const agent = {
    browser: request.useragent.browser,
    version: request.useragent.version,
    os: request.useragent.os,
    platform: request.useragent.platform,
    source: request.useragent.source,
    is: userAgentIs(request.useragent),
  };
  const referer =
    request.headers.referer === undefined ||
    request.headers.referer === null ||
    /[a-zA-Z0-9\:\/\.\-\?\&]+/.test(request.headers.referer) === false
      ? undefined
      : request.headers.referer;
  return { ...agent, ip, referer };
};

const releaseEscrowSubsidized = (escrowId, buyerSignature, sellerSignature) => {
  if (buyerSignature === "" || sellerSignature === "") {
    return true;
  }
  const provider = new ethers.providers.JsonRpcProvider(BASE_ALCHEMY_API);
  const subsidizerWallet = new ethers.Wallet(
    releaseEscrowGasSubsidizer,
    provider
  );
  const goghContract = new ethers.Contract(
    GOGH_CONTRACT_ADDRESS,
    goghContractAbi,
    subsidizerWallet
  );
  return new Promise((resolved, rejected) => {
    goghContract
      .releaseEscrow(escrowId, buyerSignature, sellerSignature)
      .then((r) => {
        rejected(true);
      })
      .catch((e) => {
        rejected(e);
      });
  });
};

serverHandler.get("/get_escrow_logs/:escrow_id", (req, res) => {
  try {
    if (goghUtils.validateAddress(req.params.escrow_id) === false) {
      gogh.end(res, "Invalid escrow id.", 400);
      return;
    }
    mongoClient
      .find("logs", {
        escrowId: req.params.escrow_id,
      })
      .then((r) => {
        if (r === null) {
          gogh.end(res, "No escrow with id found", 404);
          return;
        }
        gogh.end(res, {
          createdEscrow: r.createdEscrow ?? false,
          releasedEscrow: r.releasedEscrow ?? false,
          canceledEscrow: r.canceledEscrow ?? false,
          signedBuyer: r.signedBuyer ?? false,
          signedSeller: r.signedSeller ?? false,
          attestationCreated: r.attestationCreated ?? false,
          lastUpdated: r.lastUpdated,
        });
      })
      .catch((e) => {
        logger.error(
          "Error occured during process (get_escrow_details): " +
            JSON.stringify(e)
        );
        gogh.end(
          res,
          "An error has occured while processing your request.",
          400
        );
      });
  } catch (e) {
    logger.error(e);
    gogh.end(res, "An error has occured while processing your request.", 400);
  }
});

serverHandler.get("/get_escrow_details/:escrow_id", (req, res) => {
  try {
    if (goghUtils.validateAddress(req.params.escrow_id) === false) {
      gogh.end(res, "Invalid escrow id.", 400);
      return;
    }
    mongoClient
      .find("escrows", {
        escrowId: req.params.escrow_id,
      })
      .then((r) => {
        if (r === null) {
          gogh.end(res, "No escrow with id found", 404);
          return;
        }
        gogh.end(res, {
          uid: r.uid,
          escrowId: r.escrowId,
          token: r.token,
          owner: r.owner,
          amount: r.amount,
          seller: r.seller,
          released: r.released,
          canceled: r.canceled,
          lastUpdated: r.lastUpdated,
          buyerSignature: r.buyerSignature,
          sellerSignature: r.sellerSignature,
          releaseTxHash: r.releaseTxHash,
          cancelTxHash: r.cancelTxHash,
        });
      })
      .catch((e) => {
        logger.error(
          "Error occured during process (get_escrow_details): " +
            JSON.stringify(e)
        );
        gogh.end(
          res,
          "An error has occured while processing your request.",
          400
        );
      });
  } catch (e) {
    logger.error(e);
    gogh.end(res, "An error has occured while processing your request.", 400);
  }
});

serverHandler.post("/sign_purchase", (req, res) => {
  try {
    if (goghUtils.validateSignedPurchase(req.body) === false) {
      gogh.end(res, "Invalid escrow packet.", 400);
      return;
    }
    const packet = req.body;
    const escrowData = {
      escrowId: packet.unsignedData.escrowId,
      token: packet.unsignedData.token,
      amount: packet.unsignedData.amount,
      recipient: packet.unsignedData.recipient,
      owner: packet.unsignedData.owner,
    };
    const signature = packet.signature;
    const signer = goghUtils.getSignatureSigner(escrowData, signature);
    if (
      signer.toLowerCase() !== escrowData.owner &&
      signer.toLowerCase() !== escrowData.recipient
    ) {
      gogh.end(res, "Invalid escrow packet. Signature mismatch.", 400);
      return;
    }
    let localEscrowData;
    mongoClient
      .find("escrows", {
        escrowId: escrowData.escrowId,
        $or: [
          {
            owner: signer.toLowerCase(),
          },
          {
            recipient: signer.toLowerCase(),
          },
        ],
      })
      .then((r) => {
        if (r === null) {
          gogh.end(res, "No escrow by signer", 404);
          return null;
        }
        localEscrowData = {
          uid: r.uid,
          escrowId: r.escrowId,
          token: r.token,
          buyer: r.owner,
          amount: r.amount,
          seller: r.recipient,
          released: r.released,
          canceled: r.canceled,
          releaseTxHash: r.releaseTxHash,
          cancelTxHash: r.cancelTxHash,
          buyerSignature: r.buyerSignature,
          sellerSignature: r.sellerSignature,
        };
        const signerIsBuyer = localEscrowData.buyer === signer.toLowerCase();
        localEscrowData = {
          ...(signerIsBuyer === true
            ? {
                buyerSignature: signature,
              }
            : {
                sellerSignature: signature,
              }),
        };
        return mongoClient.updateMany(
          ["escrows", "logs"],
          [
            {
              escrowId: localEscrowData.escrowId,
            },
            {
              escrowId: localEscrowData.escrowId,
            },
          ],
          [
            {
              $set: {
                lastUpdated: new Date().getTime(),
                ...(signerIsBuyer === true
                  ? {
                      buyerSignature: signature,
                    }
                  : {
                      sellerSignature: signature,
                    }),
              },
            },
            {
              $set: {
                lastUpdated: new Date().getTime(),
                ...(signerIsBuyer === true
                  ? { signedBuyer: true }
                  : { signedSeller: true }),
              },
            },
          ],
          [true, true]
        );
      })
      .then((r) => {
        if (r === null) {
          throw false;
        }
        if (mongoClient.hasUpdateSucceeded(r) === false) {
          logger.error(
            `Failed to update local escrow data to insert signature for ${escrowData.escrowId}.`
          );
          throw false;
        }
        if (
          susidizeReleaseEscrowGas === true &&
          releaseEscrowGasSubsidizer !== undefined &&
          releaseEscrowGasSubsidizer !== null &&
          releaseEscrowGasSubsidizer !== ""
        ) {
          return releaseEscrowSubsidized(
            localEscrowData.escrowId,
            localEscrowData.buyerSignature,
            localEscrowData.sellerSignature
          );
        }
        return true;
      })
      .then((r) => {
        if (r instanceof Error === true) {
          logger.error(
            `Failed to update release escrow (subsidized) to chain for ${escrowData.escrowId}.`
          );
          throw false;
        }
        logger.print(
          `Escrow ${escrowData.escrowId} successfully saved signature for escrow.`
        );
        gogh.end(
          res,
          "Signature has been added to the escrow and escrow has been released."
        );
      })
      .catch((e) => {
        logger.error("Error occured during process (sign_purchase): " + e);
        gogh.end(
          res,
          "An error has occured while processing your request.",
          400
        );
      });
  } catch (e) {
    logger.error(e);
    gogh.end(res, "An error has occured while processing your request.", 400);
  }
});

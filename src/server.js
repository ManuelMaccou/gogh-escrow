const fs = require("fs");
const cors = require("cors");
const ethers = require("ethers5");
const useragent = require("express-useragent");
const Mongo = require("./mongo.js");
const logger = require("./logger.js");
const express = require("express");

const sslPath = "../ssl";
const { ENABLE_SSL, SSL_KEY, SSL_CRT, SSL_CA, PORT } = process.env;
const sslEnabled = ENABLE_SSL === "1";
const dropConnectionsAfterMs = 30000;
const maxConnections = 500;

class Gogh {
  server;
  serverSecured;

  startServer(port, noTls = false) {
    try {
      this.server = express();
      const ssl = noTls === true ? {} : this.readSSL();
      if (ssl === false && noTls === false) {
        throw "SSL Read Error";
      }
      this.createServer(ssl, port, noTls);
      logger.print("Gogh server initialised");
    } catch (e) {
      logger.error("Error when creating express server: " + e);
    }
  }

  createServer(ssl, port, noTls = false) {
    try {
      this.serverSecured =
        noTls === true ? this.server : https.createServer(ssl, this.server);
      this.serverSecured.use(
        cors({
          allowedOrigin: "*",
          allowedHeaders: [
            "Content-Length",
            "Content-Type",
            "content-type",
            "content-length",
            "enctype",
          ],
        })
      );
      this.serverSecured.use(express.json());
      this.serverSecured.listen(port, () => {
        this.server.maxConnections = maxConnections;
        if (noTls === true) {
          return;
        }
        this.serverSecured.setTimeout(dropConnectionsAfterMs);
      });
    } catch (e) {
      logger.error("Unable to resolve SSL.");
    }
  }

  readSSL() {
    try {
      const sslCredentials = {
        key: fs.readFileSync(`${sslPath}/${SSL_KEY}`, "utf-8"),
        cert: fs.readFileSync(`${sslPath}/${SSL_CRT}`, "utf-8"),
        ca: fs.readFileSync(`${sslPath}/${SSL_CA}`, "utf-8"),
      };
      return sslCredentials;
    } catch (e) {
      logger.error("Unble to read SSL file.");
      return false;
    }
  }

  end(res, message, status = 200) {
    res.status(status).send(message);
  }
}

class GoghUtils {
  validateAddress(address) {
    const walletCheck = /^(0x)?[0-9a-fA-F]{40}$/m;
    return walletCheck.test(address);
  }

  validateSignature(signature) {
    const signatureCheck = /^(0x)?[0-9a-fA-F]+$/m;
    return signatureCheck.test(signature);
  }

  validateSignedPurchase(packet) {
    if ("signature" in packet === false || "unsignedData" in packet === false) {
      return false;
    }
    if (
      "signature" in packet === true &&
      this.validateSignature(packet.signature) === false
    ) {
      return false;
    }
    if (
      "unsignedData" in packet === true &&
      ("escrowId" in packet.unsignedData === false ||
        "token" in packet.unsignedData === false ||
        "amount" in packet.unsignedData === false ||
        "recipient" in packet.unsignedData === false ||
        "owner" in packet.unsignedData === false)
    ) {
      return false;
    }
    return true;
  }

  getSignatureSigner(escrowData, signature) {
    const payload = ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "uint256", "address", "address"],
      [
        escrowData.escrowId,
        escrowData.token,
        escrowData.amount,
        escrowData.recipient,
        escrowData.owner,
      ]
    );
    const escrowMessageHash = ethers.utils.keccak256(payload);
    const messageHashBinary = ethers.utils.arrayify(escrowMessageHash);
    return ethers.utils.verifyMessage(messageHashBinary, signature);
  }
}

const gogh = new Gogh();
const goghUtils = new GoghUtils();
const mongoClient = new Mongo();
gogh.startServer(PORT, sslEnabled === false);
const serverHandler = gogh.serverSecured;

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
        const localEscrowData = {
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
        };
        const signerIsBuyer = localEscrowData.buyer === signer.toLowerCase();
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
          return;
        }
        if (mongoClient.hasUpdateSucceeded(r) === false) {
          logger.error(
            `Failed to update local escrow data to insert signature for ${escrowData.escrowId}.`
          );
          throw false;
        }
        logger.print(
          `Escrow ${escrowData.escrowId} successfully saved signature for escrow.`
        );
        gogh.end(res, "Signature has been added to the escrow.");
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

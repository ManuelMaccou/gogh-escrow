const env = require("dotenv");
env.config();
const ethers = require("ethers5");
const ethers6 = require("ethers6");
const Mongo = require("./mongo.js");
const logger = require("./logger.js");
const { EAS, SchemaEncoder } = require("@ethereum-attestation-service/eas-sdk");
const goghContractAbi = require("./assets/gogh-contract.abi.json");

const {
  BASE_ALCHEMY_API,
  GOGH_CONTRACT_ADDRESS,
  ATTESTATION_REGISTRY_ID,
  ATTESTATION_ATTESTATOR_PRIVATE_KEY,
} = process.env;

const mongoClient = new Mongo();
const provider = new ethers.providers.JsonRpcProvider(BASE_ALCHEMY_API);
const providerEthers6 = new ethers6.JsonRpcProvider(BASE_ALCHEMY_API);
const contract = new ethers.Contract(
  GOGH_CONTRACT_ADDRESS,
  goghContractAbi,
  provider
);
const eas = new EAS("0x4200000000000000000000000000000000000021");
const schemaEncoder = new SchemaEncoder(
  "address escrowId,address buyer,address seller,address token,uint256 amount"
);
const easSigner = new ethers6.Wallet(
  ATTESTATION_ATTESTATOR_PRIVATE_KEY,
  providerEthers6
);
eas.connect(easSigner);

const attest = (escrowData) => {
  return new Promise((resolved, rejected) => {
    const encodedData = schemaEncoder.encodeData([
      { name: "escrowId", value: escrowData.escrowId, type: "address" },
      { name: "buyer", value: escrowData.owner, type: "address" },
      { name: "seller", value: escrowData.recipient, type: "address" },
      { name: "token", value: escrowData.token, type: "address" },
      {
        name: "amount",
        value: "0x" + escrowData.amount.toString(16),
        type: "uint256",
      },
    ]);
    eas
      .attest({
        schema: ATTESTATION_REGISTRY_ID,
        data: {
          recipient: "0x0000000000000000000000000000000000000000",
          expirationTime: 0,
          revocable: false,
          data: encodedData,
        },
      })
      .then((r) => {
        const tx = r;
        return tx.wait();
      })
      .then((r) => {
        const newAttestationUID = r;
        logger.print(
          `Attestation successfully created for escrow (released) ${escrowData.escrowId} - attestion UID: ${newAttestationUID}.`
        );
        resolved(newAttestationUID);
      })
      .catch((e) => {
        logger.error("An error has occured while creating attestation: " + e);
        rejected(false);
      });
  });
};

const checkEvents = () => {
  logger.print("Starting Oracle...");
  logger.print("Checking for events...");
  const canceledEscrowDetails = contract.filters.canceled();
  const expiryStateDetails = contract.filters.expiryState();
  const createdEscrowDetails = contract.filters.created();
  const releasedEscrowDetails = contract.filters.released();
  const tokenStateDetails = contract.filters.tokenState();
  const contractStateDetails = contract.filters.contractState();
  const feeStateDetails = contract.filters.feeState();
  const filterExpiryState = {
    address: GOGH_CONTRACT_ADDRESS,
    topics: [expiryStateDetails.topics[0]],
  };
  provider.on(filterExpiryState, (e) => {
    logger.print(
      `Escrow expiry has been changed to: ${e.data.toString(
        10
      )}ms from escrow creation time.`
    );
  });
  const filterContractState = {
    address: GOGH_CONTRACT_ADDRESS,
    topics: [contractStateDetails.topics[0]],
  };
  provider.on(filterContractState, (e) => {
    if (
      e.data ===
      "0x0000000000000000000000000000000000000000000000000000000000000001"
    ) {
      logger.print("Contract has been enabled.");
    } else {
      logger.print("Contract has been disabled.");
    }
  });
  const filterTokenState = {
    address: GOGH_CONTRACT_ADDRESS,
    topics: [tokenStateDetails.topics[0]],
  };
  provider.on(filterTokenState, (e) => {
    const data = e.data.slice(2, e.data.length).match(/.{1,64}/gm);
    const token = `0x${data[0].substr(-40)}`;
    const enabled =
      data[1] ===
      "0000000000000000000000000000000000000000000000000000000000000001";
    logger.print(
      `Token ${token} has been ${enabled === true ? "en" : "dis"}abled.`
    );
  });
  const filterFeeState = {
    address: GOGH_CONTRACT_ADDRESS,
    topics: [feeStateDetails.topics[0]],
  };
  provider.on(filterFeeState, (e) => {
    const fee = parseInt(e.data.slice(-3), 16);
    logger.print(`Fee has been changed to ${fee}%.`);
  });
  const filterCreatedEscrowState = {
    address: GOGH_CONTRACT_ADDRESS,
    topics: [createdEscrowDetails.topics[0]],
  };
  provider.on(filterCreatedEscrowState, (e) => {
    const data = e.data.slice(2, e.data.length).match(/.{1,64}/gm);
    const uid = parseInt(data[0], 16);
    const escrowId = `0x${data[1].substr(-40)}`;
    const from = `0x${data[2].substr(-40)}`;
    const recipient = `0x${data[3].substr(-40)}`;
    const token = `0x${data[4].substr(-40)}`;
    const amount = parseInt(data[5], 16);
    escrowData = {
      escrowId,
      token,
      amount: amount.toString(),
      recipient,
      owner: from,
    };
    mongoClient
      .updateMany(
        ["escrows", "logs"],
        [
          {
            escrowId,
          },
          {
            escrowId,
          },
        ],
        [
          {
            $set: {
              lastUpdated: new Date().getTime(),
              uid,
              escrowId,
              token,
              amount,
              recipient,
              timestamp: e.blockTimestamp,
              owner: from,
              released: false,
              canceled: false,
              buyerSignature: "",
              sellerSignature: "",
              creationTxData: e.data,
              creationTxHash: e.transactionHash,
            },
          },
          {
            $set: {
              lastUpdated: new Date().getTime(),
              createdEscrow: true,
            },
          },
        ],
        [true, true]
      )
      .then((r) => {
        if (mongoClient.hasUpdateSucceeded(r) === false) {
          logger.error(
            `Failed to update local escrow data for ${escrowId}.`,
            escrowData
          );
          return;
        }
        logger.print(
          `Escrow ${escrowId} successfully created for product ${uid} with the amount of ${amount} with token ${token} reserved for ${recipient}.`
        );
      })
      .catch((e) => {
        logger.error(
          `Failed to create local escrow data for ${escrowId}.`,
          escrowData
        );
      });
  });
  const filterReleasedEscrowState = {
    address: GOGH_CONTRACT_ADDRESS,
    topics: [releasedEscrowDetails.topics[0]],
  };
  provider.on(filterReleasedEscrowState, (e) => {
    const data = e.data.slice(2, e.data.length).match(/.{1,64}/gm);
    const escrowId = `0x${data[0].substr(-40)}`;
    const from = `0x${data[1].substr(-40)}`;
    const recipient = `0x${data[2].substr(-40)}`;
    const amount = parseInt(data[3], 16);
    const token = `0x${data[4].substr(-40)}`;
    mongoClient
      .updateMany(
        ["escrows", "logs"],
        [
          {
            escrowId,
          },
          { escrowId },
        ],
        [
          {
            $set: {
              lastUpdated: new Date().getTime(),
              escrowId,
              amount,
              recipient,
              owner: from,
              released: true,
              releaseTxData: e.data,
              releaseTxHash: e.transactionHash,
            },
          },
          {
            $set: {
              lastUpdated: new Date().getTime(),
              releasedEscrow: true,
            },
          },
        ],
        [true, true]
      )
      .then((r) => {
        if (mongoClient.hasUpdateSucceeded(r) === false) {
          logger.error(
            `Failed to update local escrow data (released escrow) for ${escrowId}.`
          );
          return;
        }
        logger.print(
          `Product sold, escrow with id ${escrowId} has been released.`
        );
        const escrowData = {
          escrowId,
          owner: from,
          recipient,
          amount,
          token,
        };
        return attest(escrowData);
      })
      .then((r) => {
        mongoClient.updateMany(
          ["escrows", "logs"],
          [
            {
              escrowId,
            },
            {
              escrowId,
            },
          ],
          [
            {
              $set: {
                lastUpdated: new Date().getTime(),
                attestation: r,
              },
            },
            {
              $set: {
                lastUpdated: new Date().getTime(),
                attestationCreated: true,
              },
            },
          ],
          [true, true]
        );
      })
      .catch((e) => {
        logger.error(
          `Failed to create local escrow data (released escrow) for ${escrowId}.`
        );
      });
  });
  const filterCanceledEscrowState = {
    address: GOGH_CONTRACT_ADDRESS,
    topics: [canceledEscrowDetails.topics[0]],
  };
  provider.on(filterCanceledEscrowState, (e) => {
    const data = e.data.slice(2, e.data.length).match(/.{1,64}/gm);
    const escrowId = `0x${data[0].substr(-40)}`;
    const from = `0x${data[1].substr(-40)}`;
    const recipient = `0x${data[2].substr(-40)}`;
    const amount = parseInt(data[3], 16);
    mongoClient
      .updateMany(
        ["escrows", "logs"],
        [
          {
            escrowId,
          },
          { escrowId },
        ],
        [
          {
            $set: {
              lastUpdated: new Date().getTime(),
              escrowId,
              amount,
              recipient,
              owner: from,
              canceled: true,
              cancelationTxData: e.data,
              cancelationTxHash: e.transactionHash,
            },
          },
          {
            $set: {
              lastUpdated: new Date().getTime(),
              canceledEscrow: true,
            },
          },
        ],
        [true, true]
      )
      .then((r) => {
        if (mongoClient.hasUpdateSucceeded(r) === false) {
          logger.error(
            `Failed to update local escrow data (canceled escrow) for ${escrowId}.`
          );
          return;
        }
        logger.print(
          `Escrow with id ${escrowId} has been canceled, escrow amount returned.`
        );
      })
      .catch((e) => {
        logger.error(
          `Failed to create local escrow data (canceled escrow) for ${escrowId}.`
        );
      });
  });
};
checkEvents();

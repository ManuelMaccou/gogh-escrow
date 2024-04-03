const ethers = require("ethers");

module.exports = class GoghUtilities {
  apiUrl = "http://localhost";

  constructor(goghServerApiUrl) {
    this.apiUrl = goghServerApiUrl;
  }

  signEscrowSignature(escrowData, wallet) {
    return new Promise((resolved, rejected) => {
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
      wallet
        .signMessage(messageHashBinary)
        .then((r) => {
          resolved(r);
        })
        .catch((e) => {
          rejected(e);
        });
    });
  }

  getEscrowDetails(escrowId) {
    return new Promise((resolved, rejected) => {
      fetch(`${this.apiUrl}/get_escrow_details/${escrowId}`, {
        method: "GET",
      })
        .then(async (r) => {
          if (r.status !== 200) {
            const error = await r.text();
            throw error;
          }
          const response = await r.json();
          resolved(response);
          return true;
        })
        .catch((e) => {
          rejected(e);
        });
    });
  }

  getEscrowLogs(escrowId) {
    return new Promise((resolved, rejected) => {
      fetch(`${this.apiUrl}/get_escrow_logs/${escrowId}`, {
        method: "GET",
      })
        .then(async (r) => {
          if (r.status !== 200) {
            const error = await r.text();
            throw error;
          }
          const response = await r.json();
          resolved(response);
          return true;
        })
        .catch((e) => {
          rejected(e);
        });
    });
  }
};

const ethers = require("ethers5");

module.exports = class GoghUtils {
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
};

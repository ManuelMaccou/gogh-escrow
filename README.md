# Gogh Server

### About

A horizontally scalable server application for Gogh backend infrastructure.

### Core requirements for installation

The follow instruction contents will outline explanations for these installations:

1. Install NodeJS
2. Install & Configure MongoDB
3. Configure .env file
4. Running the Oracle
5. Running the Server
6. Creating the Attestation schema for https://attest.sh

### Keywords:

- Oracle: the daemon server that monitors events on the Gogh smart contract and updates the local database for escrow changes
- Server: the REST API server that accepts requests from the front-end to update local database record of escrows (mainly for adding buyer/seller signatures)

# Get Started - Installation & Configuration

## Node 18.x+

Install Node 18.18 LTS by running:

```
brew install node@18
```

## Mongo DB

Mac Installation

```
brew tap mongodb/brew
brew update
brew install mongodb-community@7.0
```

### Create MongoDB Administrator

To create an administrator, follow the instructions below:

Open mongo:

`mongosh`

Create the administrative user:

```
use admin
```

```
db.createUser(
  {
    user: "gogh",
    pwd: "<PASSWORD HERE>",
    roles: [ { role: "readWrite", db: "gogh" } ]
  }
 )
```

Exit the shell:

```
exit
```

### Configure MongoDB TLS/SSL

https://www.mongodb.com/docs/manual/tutorial/configure-ssl/

```
sudo systemctl restart mongod
```

## Server & Oracle ENV File

```
# Core credentials
BASE_ALCHEMY_API=https://base-sepolia.g.alchemy.com/v2/DO8BiTTs-jCAUSojKnkVZfNXmFmxxE-e
GOGH_CONTRACT_ADDRESS=0x90140170b6be646097364fe163e319d5242622fa
ATTESTATION_ATTESTATOR_PRIVATE_KEY=<Attestator private key NOT the gogh contract administrator wallet>
ATTESTATION_REGISTRY_ID=<Attestator schema address>
RELEASE_ESCROW_GAS_SUBSIDY_HOST_PRIVATE_KEY=<Private key of the wallet that will send the transaction for subsidized releaseEscrow>

# Database credentials
MASTER_SQL_DB_NAME=gogh
MASTER_SQL_USER=gogh
MASTER_SQL_IP=127.0.0.1
MASTER_SQL_PORT=27017
MASTER_SQL_PASSWORD=<Mongo DB password>

# SSL (if available), SSL files must go to /ssl
ENABLE_SSL=0
SSL_KEY=ssl.key
SSL_CRT=ssl.crt
SSL_CA=ssl.ca.crt

# Server configurations (change port to 443 on production)
ENABLE_SSL=0
PORT=42069

# Oracle settings
BACKUP_SERVER_IP=127.0.0.1
BACKUP_SERVER_PORT=42069

# Server settings
SUBSIDIZE_RELEASE_ESCROW_GAS_FEE=0
```

## Install NPM Packages

Perform package installation by running:

```
npm install
```

## Run Oracle

The Oracle keeps track of events (sales) on-chain and updates the local database.

```
npm run run:oracle
```

## Run Server

The Server acceps REST API requests from the public and updates the local database.

```
npm run run:server
```

## Server API Endpoints

Below are the list of API endpoints accessible in the server.

`GET` - `/get_escrow_details/:escrow_id`

`Returns 200, 400/404` on error/not-found on success with escrow data:

```
{
  uid: Product UID - number
  escrowId: Escrow ID - address,
  token: Token used - address,
  owner: Buyer's wallet address,
  amount: Amount of escrow - number,
  seller: Seller's wallet address,
  released: If the escrow has been released - boolean,
  canceled: If the escrow has been canceled - boolean,
  lastUpdated: when the escrow was last updated - number timestamp
  buyerSignature: The buyer's signature if signed,
  sellerSignature: The seller's signature if signed,
  releaseTxHash: The release transaction hash on base chain,
  cancelTxHash: The cancelation transaction has on base chain,
}
```

`GET` - `/get_escrow_logs/:escrow_id`

`Returns 200, 400/404` on error/not-found on success with escrow chronological activity data:

```
{
  lastUpdated: when the log was last updated - number timestamp,
  createdEscrow: has the escrow been created - boolean,
  canceledEscrow: has the escrow been canceled - boolean,
  releasedEscrow: has the escrow been released - boolean,
  attestationCreated: has the escrow attestation been created - boolean,
  signedBuyer: has the buyer signed the sale purchase - boolean,
  signedSeller: has the seller signed the sale purchase - boolean
}
```

`POST` - `/sign_purchase`

`Returns 200, 400/404` on error/not-found on success

JSON body required:

```
{
  signature: signed signature - string
  unsignedData: {
    escrowId: The escrow ID - address,
    token: The token address - address,
    amount: The escrow amount - number,
    recipient: The escrow recipient - address,
    owner: The escrow creator (buyer) - address,
  }
}
```

# EAS Attestation Scheme Creation & Configuration

Create the following attestation schema on:

```
https://base.easscan.org/schema/create
```

With the following schme structure:

```
escrowId - address
buyer - address
seller - address
token - address
amount - uint256
```

Take the scheme registry UID and update the environment file variable `ATTESTATION_REGISTRY_ID`

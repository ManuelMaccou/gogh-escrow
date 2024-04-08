const env = require("dotenv");
env.config();
const fs = require("fs");
const cors = require("cors");
const https = require("https");
const useragent = require("express-useragent");
const express = require("express");
const logger = require("./logger.js");

module.exports = class Gogh {
  server;
  serverSecured;

  startServer(port, tls = false) {
    try {
      this.server = express();
      const ssl = tls === false ? {} : this.readSSL();
      if (ssl === false && tls === true) {
        throw "SSL Read Error";
      }
      this.createServer(ssl, port, tls);
      logger.print(
        `Gogh server initialised with ${tls === false ? "no" : ""} SSL enabled.`
      );
    } catch (e) {
      logger.error("Error when creating express server: " + e);
    }
  }

  createServer(ssl, port, tls = false) {
    try {
      const dropConnectionsAfterMs = 30000;
      const maxConnections = 500;
      this.serverSecured =
        tls === false ? this.server : https.createServer(ssl, this.server);
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
      this.serverSecured.use(useragent.express());
      this.serverSecured.use(express.json());
      this.serverSecured.listen(port, () => {
        this.serverSecured.maxConnections = maxConnections;
      });
    } catch (e) {
      logger.error("Unable to resolve SSL. " + e);
    }
  }

  readSSL() {
    try {
      const sslPath = __dirname + "/../ssl";
      const { SSL_KEY, SSL_CRT } = process.env;
      const sslCredentials = {
        key: fs.readFileSync(`${sslPath}/${SSL_KEY}`, "utf-8"),
        cert: fs.readFileSync(`${sslPath}/${SSL_CRT}`, "utf-8"),
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
};

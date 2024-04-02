const fs = require("fs");
const cors = require("cors");
const useragent = require("express-useragent");
const express = require("express");

module.exports = class Gogh {
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
      const dropConnectionsAfterMs = 30000;
      const maxConnections = 500;
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
      const sslPath = "../ssl";
      const { SSL_KEY, SSL_CRT, SSL_CA } = process.env;
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
};

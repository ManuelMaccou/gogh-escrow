const env = require("dotenv");
const logger = require("./logger.js");
env.config();
const { MongoClient } = require("mongodb");

const {
  MASTER_SQL_DB_NAME,
  MASTER_SQL_USER,
  MASTER_SQL_IP,
  MASTER_SQL_PORT,
  MASTER_SQL_PASSWORD,
} = process.env;

class Mongo {
  client;

  constructor(logService) {
    this.initialise()
      .then((r) => {
        if (r === false) {
          throw false;
        }
        return this.connect(r);
      })
      .then((r) => {
        if (r === false) {
          throw false;
        }
        logger.print("SQL database initialised");
      })
      .catch((e) => {
        console.log(e);
        logger.error("Unable to initialise SQL Server");
      });
  }

  initialise() {
    return new Promise((resolved, rejected) => {
      try {
        this.client = new MongoClient(
           MASTER_SQL_IP,
          {
            appName: "gogh",
            auth: {
              username: MASTER_SQL_USER,
              password: MASTER_SQL_PASSWORD,
            },
          }
        );
        resolved(this.client);
      } catch (e) {
        rejected(false);
      }
    });
  }

  connect(client) {
    return new Promise((resolved, rejected) => {
      client
        .connect()
        .then((r) => {
          resolved(r);
        })
        .catch((e) => {
          rejected(false);
        });
    });
  }

  insert(collection, payload) {
    const dbCollection = this.client
      .db(MASTER_SQL_DB_NAME)
      .collection(collection);
    return new Promise((resolved, rejected) => {
      dbCollection
        .insertOne(payload)
        .then((r) => {
          resolved(payload);
        })
        .catch((e) => {
          rejected(false);
        });
    });
  }

  /**
   *
   * @param {*} collection string | string[]
   * @param {*} payload any[]
   * @returns
   */
  insertMany(collection, payload) {
    return new Promise((resolved, rejected) => {
      const updateCollection = (c, pl, last = false) => {
        const dbCollection = this.client.db(MASTER_SQL_DB_NAME).collection(c);
        dbCollection
          .insertMany(pl)
          .then((r) => {
            if (last === true) {
              resolved(r);
            }
          })
          .catch((e) => {
            rejected(false);
          });
      };
      if (typeof collection === "string") {
        updateCollection(collection, payload);
        return;
      }
      collection.map((c, i) => {
        const last = collection.length === i + 1;
        updateCollection(c, payload[i], last);
      });
    });
  }

  /**
   *
   * @param {*} collection string
   * @param {*} filter object
   * @param {*} payload object
   * @param {*} upsert boolean
   * @returns
   */
  update(collection, filter, payload, upsert = false) {
    const dbCollection = this.client
      .db(MASTER_SQL_DB_NAME)
      .collection(collection);
    return new Promise((resolved, rejected) => {
      dbCollection
        .updateOne(filter, payload, { upsert })
        .then((r) => {
          resolved(r);
        })
        .catch((e) => {
          rejected(false);
        });
    });
  }

  /**
   *
   * @param {*} collection string[] | string
   * @param {*} filter object | object[]
   * @param {*} payload object | object[]
   * @param {*} upsert boolean | boolean[]
   * @returns
   */
  updateMany(collection, filter, payload, upsert = false) {
    return new Promise((resolved, rejected) => {
      const updateCollection = (c, fi, pl, up, last = false) => {
        const dbCollection = this.client.db(MASTER_SQL_DB_NAME).collection(c);
        dbCollection
          .updateMany(fi, pl, { upsert: up })
          .then((r) => {
            if (last === true) {
              resolved(r);
            }
          })
          .catch((e) => {
            rejected(false);
          });
      };
      if (typeof collection === "string") {
        updateCollection(collection, filter, payload, upsert);
        return;
      }
      collection.map((c, i) => {
        const last = collection.length === i + 1;
        updateCollection(
          c,
          filter[i],
          payload[i],
          typeof upsert === "boolean" ? false : upsert[i],
          last
        );
      });
    });
  }

  /**
   *
   * @param {*} collection string
   * @param {*} payload object
   * @returns
   */
  delete(collection, payload) {
    const dbCollection = this.client
      .db(MASTER_SQL_DB_NAME)
      .collection(collection);
    return new Promise((resolved, rejected) => {
      dbCollection
        .deleteOne(payload)
        .then((r) => {
          resolved(r);
        })
        .catch((e) => {
          rejected(false);
        });
    });
  }

  /**
   *
   * @param {*} collection string | string[]
   * @param {*} payload object | object[]
   * @returns
   */
  deleteMany(collection, payload) {
    return new Promise((resolved, rejected) => {
      const updateCollection = (c, pl, last = false) => {
        const dbCollection = this.client.db(MASTER_SQL_DB_NAME).collection(c);
        dbCollection
          .deleteMany(pl)
          .then((r) => {
            if (last === true) {
              resolved(r);
            }
          })
          .catch((e) => {
            rejected(false);
          });
      };
      if (typeof collection === "string") {
        updateCollection(collection, payload);
        return;
      }
      collection.map((c, i) => {
        const last = collection.length === i + 1;
        updateCollection(c, payload[i], last);
      });
    });
  }

  /**
   *
   * @param {*} collection string
   * @returns
   */
  findAll(collection) {
    return new Promise((resolved, rejected) => {
      const dbCollection = this.client
        .db(MASTER_SQL_DB_NAME)
        .collection(collection);
      dbCollection
        .find()
        .toArray()
        .then((r) => {
          const records = r.map((c) => {
            const keys = Object.keys(c);
            const data = {};
            for (const k of keys) {
              if (k === "_id") {
                continue;
              }
              data[k] = keys[k];
            }
            return data;
          });
          resolved(records);
          return;
        })
        .catch((e) => {
          rejected(false);
        });
    });
  }

  /**
   *
   * @param {*} collection string
   * @param {*} payload object
   * @returns
   */
  find(collection, payload) {
    const dbCollection = this.client
      .db(MASTER_SQL_DB_NAME)
      .collection(collection);
    return new Promise((resolved, rejected) => {
      dbCollection
        .findOne(payload)
        .then((r) => {
          resolved(r);
        })
        .catch((e) => {
          rejected(false);
        });
    });
  }

  /**
   *
   * @param {*} collection string
   * @param {*} payload object[]
   * @returns
   */
  findMany(collection, payload) {
    const dbCollection = this.client
      .db(MASTER_SQL_DB_NAME)
      .collection(collection);
    return new Promise((resolved, rejected) => {
      try {
        const findResult = dbCollection.find(payload).map((f) => f);
        resolved(findResult);
      } catch (e) {
        rejected(false);
      }
    });
  }

  /**
   *
   * @param {*} updateResult any
   * @returns
   */
  hasUpdateSucceeded(updateResult) {
    const upsertFailure =
      typeof updateResult === "object" &&
      "modifiedCount" in updateResult === true &&
      updateResult.modifiedCount <= 0 &&
      "upsertedId" in updateResult === true &&
      updateResult.upsertId !== null &&
      "upsertCount" in updateResult === true &&
      updateResult.upsertCount <= 0;
    const updateFailure =
      typeof updateResult === "object" &&
      "modifiedCount" in updateResult === true &&
      updateResult.modifiedCount <= 0 &&
      "upsertedId" in updateResult === true &&
      updateResult.upsertId === null &&
      "matchedCount" in updateResult === true &&
      updateResult.matchedCount <= 0;
    return updateResult === false ||
      (typeof updateResult === "object" &&
        "acknowledged" in updateResult === true &&
        updateResult.acknowledged === false) ||
      updateFailure === true ||
      upsertFailure === true ||
      (typeof updateResult === "object" &&
        "matchedCount" in updateResult === true &&
        updateResult.matchedCount <= 0 &&
        "upsertedId" in updateResult === true &&
        updateResult.upsertedCount === null)
      ? false
      : true;
  }
}

module.exports = Mongo;

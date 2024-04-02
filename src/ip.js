const logger = require("./logger.js");
const path = require("path");
const fileURLToPath = require("url");
const IP2Location = require("ip2location-nodejs");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const softBinDir = __dirname + "./assets/geo-location/";

module.exports = class IpService {
  ip2location;

  constructor() {
    this.ip2location = new IP2Location();
    this.ip2location.open(softBinDir + "ip2location-lite.BIN");
    logger.print("Initailising IP Geo Location service...");
  }

  getLocation(ipRaw) {
    let result;
    if (ipRaw.indexOf(":") > -1) {
      result = { countryShort: "unknown" };
    } else {
      try {
        result = this.ip2location.getAll(ipRaw);
      } catch (e) {
        result = { countryShort: "unknown" };
      }
    }
    this.logService.print(
      `Geo-location result for ${ipRaw}: ${JSON.stringify(result)}`
    );
    return result.countryShort.length > 5
      ? { countryShort: "unknown" }
      : result;
  }

  IP6to4(ip6) {
    const parseIp6 = (ip6str) => {
      const str = ip6str.toString();
      const ar = new Array();
      for (let i = 0; i < 8; i++) {
        ar[i] = 0;
        if (str == "::") {
          return ar;
        }
        const sar = str.split(":");
        let slen = sar.length;
        if (slen > 8) {
          slen = 8;
        }
        let j = 0;
        i = 0;
        for (i = 0; i < slen; i++) {
          if (i && sar[i] == "") {
            j = 9 - slen + i;
            continue;
          }
          ar[j] = parseInt(`0x0${sar[i]}`);
          j++;
        }
      }

      return ar;
    };

    const ip6parsed = parseIp6(ip6);
    const ip4 = `${ip6parsed[6] >> 8}.${ip6parsed[6] & 0xff}.${
      ip6parsed[7] >> 8
    }.${ip6parsed[7] & 0xff}`;
    return ip4;
  }
};

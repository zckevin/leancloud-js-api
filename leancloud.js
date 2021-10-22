const node_fetch = require("node-fetch");
const assert = require("assert");
const dotenv = require("dotenv");
const debug = require("debug")("leancloud");

dotenv.config();

if (!globalThis.fetch) {
  globalThis.fetch = node_fetch;
}

function GetEnv() {
  // from $ROOT_DIR/.env ENV file by dotenv
  const appId = process.env.LEANCLOUD_APP_ID;
  const appKey = process.env.LEANCLOUD_APP_KEY;
  const TABLE_NAME = process.env.LEANCLOUD_TABLE_NAME;
  const API_ENDPOINT = `https://${appId}.api.lncldglobal.com/1.1/classes/${TABLE_NAME}`;
  const SEARCH_ENDPOINT = `https://${appId}.api.lncldglobal.com/1.1/search/select?clazz=${TABLE_NAME}`;
  const BATCH_API_ENDPOINT = `https://${appId}.api.lncldglobal.com/1.1/batch`;

  assert(appId && appKey && TABLE_NAME, "invalid .env config file");
  return {
    TABLE_NAME,
    API_ENDPOINT,
    SEARCH_ENDPOINT,
    BATCH_API_ENDPOINT,
    APP_ID: appId,
    APP_KEY: appKey,
    WRITE_USER_SESSION: process.env.LEANCLOUD_WRITE_USER_SESSION,
  };
}

class LeanCloud {
  constructor() {
    this.config = GetEnv();
  }

  async doBatches(batches) {
    const endpoint = new URL(this.config.BATCH_API_ENDPOINT);
    const requestBody = {
      method: "POST",
      cache: "no-cache",
      headers: {
        "Content-Type": "application/json",
        "X-LC-Id": this.config.APP_ID,
        "X-LC-Key": this.config.APP_KEY,
        "X-LC-Session": this.config.WRITE_USER_SESSION,
      },
      body: JSON.stringify({
        requests: batches,
      }),
    };
    const resp = await fetch(endpoint, requestBody);
    const body = await resp.json();
    // console.log(body);
    if (body.error) {
      throw new Error(
        `Request error met for request: ${endpoint}, ${JSON.stringify(
          requestBody
        )}, body: ${body}`
      );
    }
    return body.map((result) => {
      if (result.hasOwnProperty("success")) {
        return result.success;
      } else {
        return null;
      }
    });
  }

  async batchQueryByIds(ids) {
    const batches = ids.map((id) => {
      return {
        method: "GET",
        path: `/1.1/classes/${this.config.TABLE_NAME}`,
        params: {
          id,
        },
      };
    });
    const results = await this.doBatches(batches);
    return results.map((result) => {
      if (result) {
        // query by an existing id would only return one result
        return result.results[0];
      }
      return result;
    });
  }

  async batchQueryByObjectIds(objectIds) {
    const batches = objectIds.map((objectId) => {
      return {
        method: "GET",
        path: `/1.1/classes/${this.config.TABLE_NAME}/${objectId}`,
      };
    });
    return await this.doBatches(batches);
  }

  async batchUpdate(patches) {
    const batches = patches.map((patch) => {
      return {
        method: "PUT",
        path: `/1.1/classes/${this.config.TABLE_NAME}/${patch.objectId}`,
        body: patch.body,
      };
    });
    return this.doBatches(batches);
  }

  async batchCreate(items) {
    const batches = items.map((item) => {
      return {
        method: "POST",
        path: `/1.1/classes/${this.config.TABLE_NAME}`,
        body: item,
      };
    });
    return this.doBatches(batches);
  }

  async QueryByWhere(whereObject, pageNum) {
    const url = new URL(this.config.API_ENDPOINT);
    url.searchParams.append("where", JSON.stringify(whereObject));
    url.searchParams.append("order", "-uploadDate");
    url.searchParams.append("limit", "50");
    url.searchParams.append("skip", `${50 * pageNum}`);
    debug("QueryByWhere search", url.search);

    const requestBody = {
      method: "GET",
      cache: "no-cache",
      headers: {
        "Content-Type": "application/json",
        "X-LC-Id": this.config.APP_ID,
        "X-LC-Key": this.config.APP_KEY,
      },
    };
    const resp = await fetch(url, requestBody);
    const body = await resp.json();
    if (body.error) {
      throw new Error(
        `Request error met for request: ${url}, ${JSON.stringify(
          requestBody
        )}, body: ${body}`
      );
    }
    // console.log(body);

    // to make frontend ui works
    // keep in sync with ParseHTML()
    return {
      list: body.results,
    };
  }

  async FullTextSearch(keyword, genreFilterQuery, pageNum) {
    if (!keyword || keyword.length === 0) {
      return {
        list: [],
      };
    }
    const url = new URL(this.config.SEARCH_ENDPOINT);

    // search keyword in `title` or `subtile` columns
    let q = `(title: ${keyword} OR subtitle: ${keyword})`;
    if (genreFilterQuery) {
      q = `${q} AND ${genreFilterQuery}`;
    }
    debug("FullTextSearch query string", q);

    url.searchParams.append("q", q);
    url.searchParams.append("limit", "50");
    url.searchParams.append("skip", `${50 * pageNum}`);
    // `order` field only supports `scores`, `uploadDate`, ????
    // url.searchParams.append("order", "-uploadDate");
    url.searchParams.append("order", "createdAt");

    const requestBody = {
      method: "GET",
      cache: "no-cache",
      headers: {
        "Content-Type": "application/json",
        "X-LC-Id": this.config.APP_ID,
        "X-LC-Key": this.config.APP_KEY,
      },
    };
    const resp = await fetch(url, requestBody);
    const body = await resp.json();
    if (body.error) {
      throw new Error(
        `Request error met for request: ${url}, ${JSON.stringify(
          requestBody
        )}, body: ${body}`
      );
    }
    debug("FullTextSearch result", body);

    const objectIds = body.results.map((item) => {
      return item.objectId;
    });
    const results = await this.batchQueryByObjectIds(objectIds);

    // to make frontend ui works
    // keep in sync with ParseHTML()
    return {
      list: results,
    };
  }

  /*
  async GetObjectByItemId(itemId) {
    let url = new URL(this.config.API_ENDPOINT);

    const query = {
      id: itemId,
    };
    url.searchParams.append("where", JSON.stringify(query));

    // console.log(url);

    let resp = await fetch(url, {
      method: "GET",
      cache: "no-cache",
      headers: {
        "Content-Type": "application/json",
        "X-LC-Id": this.config.APP_ID,
        "X-LC-Key": this.config.APP_KEY,
      },
    });
    let body = await resp.json();
    if (body.error) {
      console.error(body);
      return [];
    }
    return body.results[0];
  }

  async GetOneKObjects() {
    let url = new URL(this.config.API_ENDPOINT);

    // decending on create time
    url.searchParams.append("order", "-uploadDate");
    url.searchParams.append("limit", "1000");
    url.searchParams.append("skip", 0);

    let resp = await fetch(url, {
      method: "GET",
      cache: "no-cache",
      headers: {
        "Content-Type": "application/json",
        "X-LC-Id": this.config.APP_ID,
        "X-LC-Key": this.config.APP_KEY,
      },
    });
    let body = await resp.json();
    if (body.error) {
      console.error(body);
      return [];
    }
    // console.log(body);
    return body.results;
  }
  */
}

module.exports = LeanCloud;

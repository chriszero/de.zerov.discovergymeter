import https from "https";

/** Requests are sent one after another, a hanging request must not block forever */
const REQUEST_TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 3;

export type QueryParams = { [key: string]: string | number | boolean };

export interface HttpClient {
  /** GET request, returns the parsed JSON body */
  get<T>(path: string, params?: QueryParams): Promise<T>;
}

/** Error for responses with a non 2xx status code */
export class HttpError extends Error {
  public readonly status: number;

  constructor(status: number, body: string) {
    // the API returns human readable errors as text/plain
    const text = body.trim().slice(0, 200);
    super(`HTTP ${status}${text ? `: ${text}` : ""}`);
    this.name = "HttpError";
    this.status = status;
  }
}

/** true if the request failed because of invalid credentials */
export function isAuthError(error: unknown): boolean {
  return (
    error instanceof HttpError && (error.status === 401 || error.status === 403)
  );
}

/**
 * Minimal JSON HTTP client based on the Node.js https module,
 * available on every Homey without additional dependencies.
 */
export class BasicAuthHttpClient implements HttpClient {
  private readonly baseUrl: string;
  private readonly authorization: string;

  constructor(baseUrl: string, user: string, password: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.authorization =
      "Basic " + Buffer.from(`${user}:${password}`, "utf8").toString("base64");
  }

  public async get<T>(path: string, params: QueryParams = {}): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }

    const body = await this.request(url, url.host, MAX_REDIRECTS);

    try {
      return JSON.parse(body) as T;
    } catch (error) {
      throw new Error(`Invalid JSON response from ${path}`);
    }
  }

  private request(
    url: URL,
    authorizedHost: string,
    redirectsLeft: number
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const headers: { [key: string]: string } = {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "de.zerov.discovergymeter",
      };
      // like fetch: credentials are only sent to the original host
      if (url.host === authorizedHost) {
        headers.Authorization = this.authorization;
      }

      const req = https.get(url, { headers }, (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;

        if (status >= 300 && status < 400 && location) {
          res.resume(); // discard body
          clearTimeout(timer);

          const target = new URL(location, url);
          if (target.protocol !== "https:" || redirectsLeft <= 0) {
            reject(new HttpError(status, `Redirect to ${target.origin} not followed`));
            return;
          }
          this.request(target, authorizedHost, redirectsLeft - 1).then(
            resolve,
            reject
          );
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        res.on("end", () => {
          clearTimeout(timer);
          const body = Buffer.concat(chunks).toString("utf8");
          if (status < 200 || status >= 300) {
            reject(new HttpError(status, body));
          } else {
            resolve(body);
          }
        });
      });

      const timer = setTimeout(() => {
        req.destroy(
          new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000} s`)
        );
      }, REQUEST_TIMEOUT_MS);

      req.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }
}

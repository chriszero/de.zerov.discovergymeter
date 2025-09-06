import { ConsumerToken, OAuthToken } from "./models";
import axios, { AxiosInstance } from "axios";
import addOAuthInterceptor, { OAuthInterceptorConfig } from "axios-oauth-1.0a";

const DISCOVERGY_API_BASE_URL = "https://api.inexogy.com/public/v1";

export interface DiscovergyAuth {
  authorizeInstance(): Promise<AxiosInstance>;
}

export class DiscovergyBasicAuth implements DiscovergyAuth {
  private user: string;
  private password: string;

  public constructor(user: string, password: string) {
    this.user = user;
    this.password = password;
  }

  public async authorizeInstance(): Promise<AxiosInstance> {
    const basicAuthClient = axios.create({
      baseURL: DISCOVERGY_API_BASE_URL,
      auth: {
        username: this.user,
        password: this.password,
      },
    });

    return basicAuthClient;
  }
}

export class DiscovergyOAuth implements DiscovergyAuth {
  private readonly step1: string = "/oauth1/consumer_token";
  private readonly step2: string = "/oauth1/request_token";
  private readonly step3: string = "/oauth1/authorize";
  private readonly step4: string = "/oauth1/access_token";

  private user: string | undefined;
  private password: string | undefined;
  private client: string;

  private oAuthToken: OAuthToken | undefined;

  public constructor(client: string, user: string = "", password: string = "", oAuthToken?: OAuthToken)
  {
    axios.defaults.baseURL = DISCOVERGY_API_BASE_URL;

    this.oAuthToken = oAuthToken;

    if (user.length == 0 || password.length == 0) {
      if(oAuthToken === undefined)
        throw new Error(
          "If oAuthToken is not defined, user and password must be defined"
        );
    }

    this.user = user;
    this.password = password;
    this.client = client;
  }

  private async getConsumerToken(): Promise<ConsumerToken> {
    /**
     * Step 1
     */

    const { data } = await axios({
      url: this.step1,
      method: "POST",
      data: "client=" + this.client,
    });

    return data;
  }

  private async getRequestToken(token: ConsumerToken): Promise<any> {
    /**
     * Step 2
     */

    // Specify the OAuth options
    const options: OAuthInterceptorConfig = {
      algorithm: "HMAC-SHA1",
      key: token.key,
      secret: token.secret,
      callback: "oob",
    };

    // Create a client whose requests will be signed
    const oAuthClient = axios.create();

    // Add interceptor that signs requests
    addOAuthInterceptor(oAuthClient, options);

    const data2 = await oAuthClient({
      url: this.step2,
      method: "POST",
    });

    const responseStep2 = new URLSearchParams(data2.data);

    const oauth_token = responseStep2.get("oauth_token");
    const oauth_token_secret = responseStep2.get("oauth_token_secret");

    return { oauth_token: oauth_token, oauth_token_secret: oauth_token_secret };
  }

  private async getAccessToken(
    consumerToken: ConsumerToken,
    token: string,
    tokenSecret: string,
    verifier: string
  ): Promise<OAuthInterceptorConfig> {
    /**
     * Step 4
     */

    const options: OAuthInterceptorConfig = {
      algorithm: "HMAC-SHA1",
      key: consumerToken.key,
      secret: consumerToken.secret,
      token: token,
      tokenSecret: tokenSecret,
      verifier: verifier,
    };

    const oAuthClient = axios.create();
    addOAuthInterceptor(oAuthClient, options);

    const data4 = await oAuthClient({
      url: this.step4,
      method: "POST",
    });

    const responseStep4 = new URLSearchParams(data4.data);
    console.log(responseStep4);

    options.token = responseStep4.get("oauth_token");
    options.tokenSecret = responseStep4.get("oauth_token_secret");

    return options;
  }



  /**
   *
   * @returns a authorized AxiosInstance
   */
  public async authorizeInstance(): Promise<AxiosInstance> {
    const oAuthClient3 = axios.create();

    if (this.oAuthToken == undefined) {
      const consumerToken = await this.getConsumerToken();
      const repuestToken = await this.getRequestToken(consumerToken);

      /**
       * Step 3, without oAuth!!
       */
      const data3 = await axios({
        url: this.step3,
        method: "GET",
        params: {
          oauth_token: repuestToken.oauth_token,
          email: this.user,
          password: this.password,
        },
      });

      const responseStep3 = new URLSearchParams(data3.data);
      const oauth_verifier = responseStep3.get("oauth_verifier");

      const finalOptions = await this.getAccessToken(
        consumerToken,
        repuestToken.oauth_token,
        repuestToken.oauth_token_secret,
        oauth_verifier + ""
      );

      this.oAuthToken = {
        key: finalOptions.key,
        secret: finalOptions.secret,
        token: finalOptions.token+'',
        tokenSecret: finalOptions.tokenSecret+'',
        verifier: finalOptions.verifier+''
      };

      addOAuthInterceptor(oAuthClient3, finalOptions);

    } else {
      const options: OAuthInterceptorConfig = {
        algorithm: "HMAC-SHA1",
        key: this.oAuthToken.key,
        secret: this.oAuthToken.secret,
        token: this.oAuthToken.token,
        tokenSecret: this.oAuthToken.tokenSecret,
        verifier: this.oAuthToken.verifier,
      };
      addOAuthInterceptor(oAuthClient3, options);
    }

    return oAuthClient3;
  }

  public getOAuthToken() : OAuthToken {
    if(this.oAuthToken == undefined) throw new Error("Authorize first");
    return this.oAuthToken;
  }
}

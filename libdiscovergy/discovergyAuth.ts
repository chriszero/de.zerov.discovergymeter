import { BasicAuthHttpClient, HttpClient } from "./httpClient";

const DISCOVERGY_API_BASE_URL = "https://api.inexogy.com/public/v1";

export interface DiscovergyAuth {
  authorizeInstance(): Promise<HttpClient>;
}

export class DiscovergyBasicAuth implements DiscovergyAuth {
  private user: string;
  private password: string;

  public constructor(user: string, password: string) {
    this.user = user;
    this.password = password;
  }

  public async authorizeInstance(): Promise<HttpClient> {
    return new BasicAuthHttpClient(
      DISCOVERGY_API_BASE_URL,
      this.user,
      this.password
    );
  }
}

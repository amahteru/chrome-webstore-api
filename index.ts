import { ReadStream, createReadStream } from "fs"
import got from "got"

const baseAPIUrl = "https://chromewebstore.googleapis.com"
const refreshTokenURI = "https://www.googleapis.com/oauth2/v4/token"

export type Options = {
  extId: string
  publisherId: string
  clientId: string
  clientSecret: string
  refreshToken: string
  uploadOnly?: boolean
}

export type PublishTarget = "default" | "trustedTesters"

export type UploadState = "SUCCEEDED" | "IN_PROGRESS" | "FAILED" | "NOT_FOUND"

export const errorMap = {
  extId:
    "No extension ID provided, e.g. https://chrome.google.com/webstore/detail/EXT_ID",
  publisherId:
    "No publisher ID provided. Find it in the Chrome Web Store Developer Dashboard account settings.",
  clientId:
    "No client ID provided. To get one: https://github.com/PlasmoHQ/chrome-webstore-api/blob/main/token.md",
  clientSecret:
    "No client secret provided. To get one: https://github.com/PlasmoHQ/chrome-webstore-api/blob/main/token.md",
  refreshToken:
    "No refresh token provided. To get one: https://github.com/PlasmoHQ/chrome-webstore-api/blob/main/token.md"
}

export const requiredFields = Object.keys(errorMap)

export class ChromeWebstoreAPI {
  options = {} as Options

  constructor(options: Options) {
    for (const field of requiredFields) {
      if (!options[field]) {
        throw new Error(errorMap[field])
      }
    }

    this.options = { ...options }
  }

  get itemPath() {
    return `publishers/${this.options.publisherId}/items/${this.options.extId}`
  }

  get uploadEndpoint() {
    return `${baseAPIUrl}/upload/v2/${this.itemPath}:upload`
  }

  get publishEndpoint() {
    return `${baseAPIUrl}/v2/${this.itemPath}:publish`
  }

  get statusEndpoint() {
    return `${baseAPIUrl}/v2/${this.itemPath}:fetchStatus`
  }

  async submit({ filePath = "", target = "default" as PublishTarget }) {
    if (target === "trustedTesters") {
      throw new Error(
        'The "trustedTesters" target is not supported by Chrome Web Store API v2'
      )
    }

    const accessToken = await this.getAccessToken()

    const { uploadState } = await this.upload(
      {
        readStream: createReadStream(filePath)
      },
      accessToken
    )

    if (uploadState === "FAILED" || uploadState === "NOT_FOUND") {
      throw new Error(`Upload failed: ${uploadState}`)
    }

    if (this.options.uploadOnly) {
      return
    }

    return this.publish(accessToken)
  }

  async upload({ readStream = null as ReadStream }, _accessToken = "") {
    if (!readStream) {
      throw new Error("Read stream missing")
    }

    const accessToken = _accessToken || (await this.getAccessToken())

    return got
      .post(this.uploadEndpoint, {
        headers: this.getHeaders(accessToken),
        body: readStream
      })
      .json<{
        uploadState: UploadState
      }>()
  }

  async publish(_accessToken = "") {
    const accessToken = _accessToken || (await this.getAccessToken())

    return got
      .post(this.publishEndpoint, {
        headers: this.getHeaders(accessToken),
        json: { publishType: "DEFAULT_PUBLISH" }
      })
      .json()
  }

  async get(_accessToken = "") {
    const accessToken = _accessToken || (await this.getAccessToken())

    return got
      .get(this.statusEndpoint, {
        headers: this.getHeaders(accessToken)
      })
      .json()
  }

  async getAccessToken() {
    const response = await got
      .post(refreshTokenURI, {
        json: {
          client_id: this.options.clientId,
          refresh_token: this.options.refreshToken,
          grant_type: "refresh_token",
          client_secret: this.options.clientSecret
        }
      })
      .json<{
        access_token: string
      }>()

    return response.access_token
  }

  getHeaders(token: string) {
    return {
      Authorization: `Bearer ${token}`
    }
  }
}

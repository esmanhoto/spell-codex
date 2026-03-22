import { describe, it, expect } from "bun:test"
import { authErrorMessage, authHeaders } from "./auth-helpers.ts"

describe("authErrorMessage", () => {
  it("returns msg when present", () => {
    expect(authErrorMessage({ msg: "Invalid credentials" }, "fallback")).toBe("Invalid credentials")
  })

  it("returns error_description when msg is absent", () => {
    expect(authErrorMessage({ error_description: "Token expired" }, "fallback")).toBe("Token expired")
  })

  it("returns error when msg and error_description absent", () => {
    expect(authErrorMessage({ error: "unauthorized" }, "fallback")).toBe("unauthorized")
  })

  it("returns fallback when no error fields present", () => {
    expect(authErrorMessage({}, "Something went wrong")).toBe("Something went wrong")
  })

  it("prefers msg over error_description and error", () => {
    expect(
      authErrorMessage(
        { msg: "primary", error_description: "secondary", error: "tertiary" },
        "fallback",
      ),
    ).toBe("primary")
  })

  it("prefers error_description over error", () => {
    expect(
      authErrorMessage({ error_description: "desc", error: "err" }, "fallback"),
    ).toBe("desc")
  })

  it("ignores non-string values", () => {
    expect(authErrorMessage({ msg: 123, error: true }, "fallback")).toBe("fallback")
  })

  it("ignores empty strings", () => {
    expect(authErrorMessage({ msg: "" }, "fallback")).toBe("fallback")
  })
})

describe("authHeaders", () => {
  it("returns Bearer header when accessToken is present", () => {
    const headers = authHeaders({ accessToken: "tok123", userId: "u1" })
    expect(headers).toEqual({ Authorization: "Bearer tok123" })
  })

  it("returns X-User-Id header when accessToken is null", () => {
    const headers = authHeaders({ accessToken: null, userId: "u1" })
    expect(headers).toEqual({ "X-User-Id": "u1" })
  })

  it("does not include X-User-Id when Bearer is used", () => {
    const headers = authHeaders({ accessToken: "tok", userId: "u1" })
    expect(headers["X-User-Id"]).toBeUndefined()
  })

  it("does not include Authorization when no token", () => {
    const headers = authHeaders({ accessToken: null, userId: "u1" })
    expect(headers["Authorization"]).toBeUndefined()
  })
})

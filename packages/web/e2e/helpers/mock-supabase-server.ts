type MockUser = {
  email: string
  password: string
  userId: string
  accessToken: string
}

const PORT = Number(process.env["MOCK_SUPABASE_PORT"] ?? "55431")
const API_KEY = process.env["SUPABASE_ANON_KEY"] ?? "test-key"

const usersByEmail = new Map<string, MockUser>([
  [
    "player.a@example.com",
    {
      email: "player.a@example.com",
      password: "password123",
      userId: "00000000-0000-0000-0000-000000000001",
      accessToken: "token-player-a",
    },
  ],
  [
    "player.b@example.com",
    {
      email: "player.b@example.com",
      password: "password123",
      userId: "00000000-0000-0000-0000-000000000002",
      accessToken: "token-player-b",
    },
  ],
])

const usersByToken = new Map<string, MockUser>(
  Array.from(usersByEmail.values()).map((user) => [user.accessToken, user]),
)

function createMockUser(email: string, password: string): MockUser {
  const userId = crypto.randomUUID()
  const accessToken = `token-${userId}`
  return { email, password, userId, accessToken }
}

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "authorization,apikey,content-type",
    Vary: "Origin",
  }
}

function json(body: Record<string, unknown>, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  })
}

async function parseBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    return (await req.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

function bearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) return null
  const token = auth.slice("Bearer ".length).trim()
  return token.length > 0 ? token : null
}

function requireApiKey(req: Request, origin: string | null): Response | null {
  if (req.headers.get("apikey") === API_KEY) return null
  return json({ error: "invalid_api_key" }, 401, origin)
}

const bunRuntime = globalThis as typeof globalThis & {
  Bun?: {
    serve: (opts: {
      port: number
      fetch: (req: Request) => Response | Promise<Response>
    }) => unknown
  }
}
if (!bunRuntime.Bun) throw new Error("Mock Supabase server must run on Bun runtime")

bunRuntime.Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    const origin = req.headers.get("origin")

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    if (url.pathname === "/health") {
      return json({ ok: true }, 200, origin)
    }

    if (url.pathname === "/auth/v1/token" && req.method === "POST") {
      const apiKeyError = requireApiKey(req, origin)
      if (apiKeyError) return apiKeyError

      if (url.searchParams.get("grant_type") !== "password") {
        return json({ error: "unsupported_grant_type" }, 400, origin)
      }
      const body = await parseBody(req)
      if (!body) return json({ error: "invalid_json" }, 400, origin)

      const email = typeof body["email"] === "string" ? body["email"].trim().toLowerCase() : ""
      const password = typeof body["password"] === "string" ? body["password"] : ""
      const user = usersByEmail.get(email)
      if (!user || user.password !== password) {
        return json(
          {
            error: "invalid_grant",
            error_description: "Invalid login credentials",
          },
          400,
          origin,
        )
      }

      return json(
        {
          access_token: user.accessToken,
          token_type: "bearer",
          expires_in: 3600,
          user: {
            id: user.userId,
            email: user.email,
          },
        },
        200,
        origin,
      )
    }

    if (url.pathname === "/auth/v1/signup" && req.method === "POST") {
      const apiKeyError = requireApiKey(req, origin)
      if (apiKeyError) return apiKeyError

      const body = await parseBody(req)
      if (!body) return json({ error: "invalid_json" }, 400, origin)

      const email = typeof body["email"] === "string" ? body["email"].trim().toLowerCase() : ""
      const password = typeof body["password"] === "string" ? body["password"] : ""
      if (email.length === 0 || password.length < 6) {
        return json({ msg: "Email + password(6+) required" }, 400, origin)
      }
      if (usersByEmail.has(email)) {
        return json({ msg: "User already registered" }, 422, origin)
      }

      const user = createMockUser(email, password)
      usersByEmail.set(email, user)
      usersByToken.set(user.accessToken, user)
      return json(
        {
          access_token: user.accessToken,
          token_type: "bearer",
          expires_in: 3600,
          user: {
            id: user.userId,
            email: user.email,
          },
        },
        200,
        origin,
      )
    }

    if (url.pathname === "/auth/v1/user" && req.method === "GET") {
      const apiKeyError = requireApiKey(req, origin)
      if (apiKeyError) return apiKeyError

      const token = bearerToken(req)
      const user = token ? usersByToken.get(token) : undefined
      if (!user) return json({ message: "Invalid JWT" }, 401, origin)

      return json(
        {
          id: user.userId,
          email: user.email,
        },
        200,
        origin,
      )
    }

    if (url.pathname === "/auth/v1/logout" && req.method === "POST") {
      const apiKeyError = requireApiKey(req, origin)
      if (apiKeyError) return apiKeyError

      const token = bearerToken(req)
      if (!token || !usersByToken.has(token)) {
        return json({ message: "Invalid JWT" }, 401, origin)
      }
      return json({}, 200, origin)
    }

    return json({ error: "not_found" }, 404, origin)
  },
})

console.log(`Mock Supabase Auth server listening on http://127.0.0.1:${PORT}`)

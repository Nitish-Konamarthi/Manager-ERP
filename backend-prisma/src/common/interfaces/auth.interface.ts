export interface JwtPayload {
  sub: string
  email: string
  orgId: string
  roles: string[]
  permissions: string[]
}

export interface AuthenticatedUser {
  id: string
  email: string
  orgId: string
  roles: string[]
  permissions: string[]
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: {
    id: string
    email: string
    name: string
    roles: string[]
  }
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

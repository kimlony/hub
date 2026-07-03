import type { AuthenticatedFetch } from './erpApply'

export interface UserSetting {
  autoErpApply: boolean
  autoNewsCollect: boolean
}

async function parseSetting(response: Response): Promise<UserSetting> {
  if (response.ok) return response.json() as Promise<UserSetting>
  let message = `환경설정 요청에 실패했습니다. (${response.status})`
  try {
    const body = await response.json() as { message?: string }
    if (body.message) message = body.message
  } catch {
    // Keep the status-based message.
  }
  throw new Error(message)
}

export async function fetchUserSetting(authenticatedFetch: AuthenticatedFetch): Promise<UserSetting> {
  return parseSetting(await authenticatedFetch('/api/hub/settings'))
}

export async function updateUserSetting(
  authenticatedFetch: AuthenticatedFetch,
  setting: UserSetting,
): Promise<UserSetting> {
  return parseSetting(await authenticatedFetch('/api/hub/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(setting),
  }))
}

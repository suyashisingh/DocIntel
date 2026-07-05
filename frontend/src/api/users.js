import client from './client'

export const getMe = () => client.get('/auth/me')

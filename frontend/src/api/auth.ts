import api from './client';

export interface User {
  id: string;
  email: string;
  isTestUser: boolean;
  hasPaymentMethod: boolean;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export const authApi = {
  register: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/register', { email, password }),

  login: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { email, password }),

  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }),

  resetPassword: (token: string, password: string) =>
    api.post('/auth/reset-password', { token, password }),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),

  me: () => api.get<{ user: User }>('/auth/me'),
};

import { createContext, useContext } from 'react';

export type AuthPromptOptions = {
  mode?: 'login' | 'register';
  /** Tiêu đề theo ngữ cảnh, vd "Đăng nhập để đặt sân". */
  title?: string;
};

const AuthPromptContext = createContext<(options?: AuthPromptOptions) => void>(() => undefined);

export const AuthPromptProvider = AuthPromptContext.Provider;

/** Mở hộp thoại đăng nhập dùng chung cho mọi hành động cần tài khoản của khách. */
export function useAuthPrompt() {
  return useContext(AuthPromptContext);
}

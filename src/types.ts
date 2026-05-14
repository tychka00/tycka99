export type SessionUser = {
  id: string;
  name: string;
  isAdmin: boolean;
};

export type ChatMessage = {
  id: string;
  sender: string;
  text: string;
  createdAt: string;
};

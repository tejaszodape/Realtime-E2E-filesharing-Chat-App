import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";

export const useChatStore = create((set, get) => ({
  messages: [],
  users: [],
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,

  getUsers: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/messages/users");
      set({ users: res.data });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch users");
    } finally {
      set({ isUsersLoading: false });
    }
  },

  getMessages: async (userId) => {
    set({ isMessagesLoading: true });
    try {
      const res = await axiosInstance.get(`/messages/${userId}`);
      set({ messages: res.data });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch messages");
    } finally {
      set({ isMessagesLoading: false });
    }
  },

  sendMessage: async (messageData) => {
    const { selectedUser, messages } = get();
    if (!selectedUser) {
      toast.error("No user selected");
      return;
    }
    
    try {
      const res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, messageData);
      set({ messages: [...messages, res.data] });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to send message");
    }
  },

  subscribeToMessages: () => {
    // Clean up existing listeners first
    get().unsubscribeFromMessages();
    
    const { selectedUser } = get();
    if (!selectedUser) return;

    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    const handleMessage = (newMessage) => {
      const isMessageSentFromSelectedUser = newMessage.senderId === selectedUser._id;
      const isMessageSentToSelectedUser = newMessage.receiverId === selectedUser._id;
      
      // Show message if it's from or to the selected user
      if (isMessageSentFromSelectedUser || isMessageSentToSelectedUser) {
        set({
          messages: [...get().messages, newMessage],
        });
      }
    };

    socket.on("newMessage", handleMessage);
    
    // Store the handler for cleanup
    set({ _messageHandler: handleMessage });
  },

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    const { _messageHandler } = get();
    
    if (socket && _messageHandler) {
      socket.off("newMessage", _messageHandler);
      set({ _messageHandler: null });
    } else if (socket) {
      // Fallback: remove all newMessage listeners
      socket.off("newMessage");
    }
  },

  setSelectedUser: (selectedUser) => {
    // Clean up previous subscription
    get().unsubscribeFromMessages();
    set({ selectedUser, messages: [] });
    
    // Load messages for new user if selected
    if (selectedUser) {
      get().getMessages(selectedUser._id);
      // Re-subscribe to messages
      setTimeout(() => {
        get().subscribeToMessages();
      }, 0);
    }
  },
}));
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { SessionUser } from '@/types';

/**
 * Client-side mirror of the session, for rendering only.
 *
 * The actual credential is an httpOnly cookie the browser holds and we cannot
 * read. This slice never contains a token — it exists so components can ask
 * "who is signed in?" without a request.
 */
interface AuthState {
  user: SessionUser | null;
  status: 'unknown' | 'authenticated' | 'anonymous';
}

const initialState: AuthState = { user: null, status: 'unknown' };

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setSession(state, action: PayloadAction<SessionUser>) {
      state.user = action.payload;
      state.status = 'authenticated';
    },
    clearSession(state) {
      state.user = null;
      state.status = 'anonymous';
    },
  },
});

export const { setSession, clearSession } = authSlice.actions;
export default authSlice.reducer;

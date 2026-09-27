import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * Appearance only. If a value came from an API call it does not belong here —
 * that is RTK Query's job.
 */
interface UiState {
  sidebarCollapsed: boolean;
  expandedNavGroups: string[];
  density: 'comfortable' | 'compact';
}

const initialState: UiState = {
  sidebarCollapsed: false,
  expandedNavGroups: [],
  density: 'comfortable',
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    setSidebarCollapsed(state, action: PayloadAction<boolean>) {
      state.sidebarCollapsed = action.payload;
    },
    /** Expanding one group must not collapse the others — this is not an accordion. */
    toggleNavGroup(state, action: PayloadAction<string>) {
      const label = action.payload;
      state.expandedNavGroups = state.expandedNavGroups.includes(label)
        ? state.expandedNavGroups.filter((g) => g !== label)
        : [...state.expandedNavGroups, label];
    },
    openNavGroup(state, action: PayloadAction<string>) {
      if (!state.expandedNavGroups.includes(action.payload)) {
        state.expandedNavGroups.push(action.payload);
      }
    },
    setDensity(state, action: PayloadAction<UiState['density']>) {
      state.density = action.payload;
    },
    hydrateUi(state, action: PayloadAction<Partial<UiState>>) {
      Object.assign(state, action.payload);
    },
  },
});

export const {
  toggleSidebar, setSidebarCollapsed, toggleNavGroup,
  openNavGroup, setDensity, hydrateUi,
} = uiSlice.actions;
export default uiSlice.reducer;

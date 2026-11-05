import React from "react";
import { AppStoreProvider } from "./stores/useAppStore";
import { MainLayout } from "./layouts/MainLayout";

export const App: React.FC = () => {
  return (
    <AppStoreProvider>
      <MainLayout />
    </AppStoreProvider>
  );
};

export default App;


import { useState } from "react";
import { SignIn } from "@clerk/clerk-react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { ConvexClerkProvider } from "./providers/ConvexClerkProvider";
import { Layout } from "./components/Layout";
import { TriageView } from "./components/TriageView";
import { FocusView } from "./components/FocusView";
import { EntitiesView } from "./components/EntitiesView";
import { SearchView } from "./components/SearchView";
import { useStoreUserEffect } from "./hooks/useStoreUserEffect";

type View = "triage" | "focus" | "entities" | "search";

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
}

function AppPage() {
  const [currentView, setCurrentView] = useState<View>("triage");
  useStoreUserEffect();

  return (
    <Layout currentView={currentView} onNavigate={(view) => setCurrentView(view as View)}>
      {currentView === "triage" && <TriageView />}
      {currentView === "focus" && <FocusView />}
      {currentView === "entities" && <EntitiesView />}
      {currentView === "search" && <SearchView />}
    </Layout>
  );
}

function App() {
  return (
    <ConvexClerkProvider>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>
      <Unauthenticated>
        <div className="flex items-center justify-center min-h-screen bg-background">
          <SignIn routing="hash" />
        </div>
      </Unauthenticated>
      <Authenticated>
        <AppPage />
      </Authenticated>
    </ConvexClerkProvider>
  );
}

export default App;
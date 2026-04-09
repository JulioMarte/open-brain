import { useState } from "react";
import { SignIn, useAuth } from "@clerk/clerk-react";
import { ConvexClerkProvider } from "./providers/ConvexClerkProvider";
import { Layout } from "./components/Layout";
import { TriageView } from "./components/TriageView";
import { FocusView } from "./components/FocusView";
import { EntitiesView } from "./components/EntitiesView";
import { SearchView } from "./components/SearchView";

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

  return (
    <Layout currentView={currentView} onNavigate={(view) => setCurrentView(view as View)}>
      {currentView === "triage" && <TriageView />}
      {currentView === "focus" && <FocusView />}
      {currentView === "entities" && <EntitiesView />}
      {currentView === "search" && <SearchView />}
    </Layout>
  );
}

function AppContent() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return <LoadingScreen />;
  }

  if (!isSignedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <SignIn routing="hash" />
      </div>
    );
  }

  return <AppPage />;
}

function App() {
  return (
    <ConvexClerkProvider>
      <AppContent />
    </ConvexClerkProvider>
  );
}

export default App;

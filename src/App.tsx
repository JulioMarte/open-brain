import { useState, useEffect } from "react";
import { SignIn, useAuth } from "@clerk/clerk-react";
import { ConvexClerkProvider } from "./providers/ConvexClerkProvider";
import { Layout } from "./components/Layout";
import { TriageView } from "./components/TriageView";
import { FocusView } from "./components/FocusView";
import { EntitiesView } from "./components/EntitiesView";
import { SearchView } from "./components/SearchView";

type View = "triage" | "focus" | "entities" | "search";

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

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
}

function AppContent() {
  const { isLoaded, isSignedIn } = useAuth();
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handleNavigate = () => {
      setCurrentPath(window.location.pathname);
    };

    // Listen for navigation changes
    window.addEventListener("popstate", handleNavigate);
    // Also check on mount and setInterval for Clerk navigation
    const interval = setInterval(handleNavigate, 500);

    return () => {
      window.removeEventListener("popstate", handleNavigate);
      clearInterval(interval);
    };
  }, []);

  // Wait for auth to load
  if (!isLoaded) {
    return <LoadingScreen />;
  }

  // Determine if we're on sign-in page
  const isOnSignInPage = currentPath === "/sign-in";

  // If signed in and on sign-in page, redirect to app
  if (isSignedIn && isOnSignInPage) {
    window.location.pathname = "/app";
    return <LoadingScreen />;
  }

  // If not signed in
  if (!isSignedIn) {
    if (isOnSignInPage) {
      // Show sign in page
      return (
        <div className="flex items-center justify-center min-h-screen bg-background">
          <SignIn routing="path" path="/sign-in" />
        </div>
      );
    }
    // If trying to access app without auth, redirect to sign-in
    window.location.pathname = "/sign-in";
    return <LoadingScreen />;
  }

  // Signed in - show app
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

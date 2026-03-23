import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "./components/Layout";
import Index from "./pages/Index";
import Enroll from "./pages/Enroll";
import Verify from "./pages/Verify";
import OnChain from "./pages/OnChain";
import Attestation from "./pages/Attestation";
import About from "./pages/About";
import Benchmarks from "./pages/Benchmarks";
import RegisterService from "./pages/RegisterService";
import Authenticate from "./pages/Authenticate";
import Dashboard from "./pages/Dashboard";
import Agent from "./pages/Agent";
import Migrate from "./pages/Migrate";
import WalletConnect from "./pages/WalletConnect";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Index />} />
            <Route path="/wallet-connect" element={<WalletConnect />} />
            <Route path="/enroll" element={<Enroll />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/on-chain" element={<OnChain />} />
            <Route path="/attestation" element={<Attestation />} />
            <Route path="/about" element={<About />} />
            <Route path="/benchmarks" element={<Benchmarks />} />
            <Route path="/register-service" element={<RegisterService />} />
            <Route path="/authenticate" element={<Authenticate />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/agent" element={<Agent />} />
            <Route path="/migrate" element={<Migrate />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

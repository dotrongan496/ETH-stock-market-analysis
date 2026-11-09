import MarketDashboard from "@/components/market-dashboard";

// Static shell; prices are fetched in the browser from the FastAPI backend.
export default function Home() {
  return <MarketDashboard />;
}

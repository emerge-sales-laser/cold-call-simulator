import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <AlertCircle className="w-10 h-10 text-muted-foreground" />
      <h1 className="text-lg font-semibold">Page Not Found</h1>
      <p className="text-sm text-muted-foreground">The page you're looking for doesn't exist.</p>
      <a href="#/" className="text-sm text-primary hover:underline mt-2">Go to Simulator</a>
    </div>
  );
}

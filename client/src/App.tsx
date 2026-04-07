import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import Call from "@/pages/Call";
import Scorecard from "@/pages/Scorecard";
import Summary from "@/pages/Summary";
import History from "@/pages/History";
import NotFound from "@/pages/not-found";

function App() {
  return (
    <Router hook={useHashLocation}>
      <Switch>
        <Route path="/" component={Call} />
        <Route path="/call/:id" component={Call} />
        <Route path="/scorecard/:id" component={Scorecard} />
        <Route path="/summary/:runId" component={Summary} />
        <Route path="/history" component={History} />
        <Route component={NotFound} />
      </Switch>
    </Router>
  );
}

export default App;

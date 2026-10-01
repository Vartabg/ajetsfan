"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { telemetryUrl } from "@/lib/telemetry";

export default function Telemetry() {
  return <><Analytics beforeSend={(event) => {
    const url = telemetryUrl(event.url);
    return url ? { ...event, url } : null;
  }} /><SpeedInsights beforeSend={(event) => {
    const url = telemetryUrl(event.url);
    return url ? { ...event, url } : null;
  }} /></>;
}

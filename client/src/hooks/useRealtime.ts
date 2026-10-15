import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import { getAccessToken, refreshSession } from "../api/http";
import { invalidateAppointmentData } from "./invalidate";

const appointmentEvents = ["appointment:created", "appointment:updated", "appointment:cancelled"];

// Keeps open screens current. The server only says that something changed; this refetches
// whatever is on screen through the normal API, so permissions are checked there as usual.
// Returns false while the live connection is down, so the layout can say so.
export function useRealtime() {
  const queryClient = useQueryClient();
  const [live, setLive] = useState(true);

  useEffect(() => {
    const refetch = () => invalidateAppointmentData(queryClient);
    let renewedToken = false;
    let connectedBefore = false;

    // The callback runs on every (re)connection, so a reconnect uses the current access token.
    const socket = io({ auth: (send) => send({ token: getAccessToken() }) });

    // Renews the access token (shared with API calls) and connects again. If that fails the session
    // is over, and the API calls will say so.
    const reconnectWithNewToken = () => refreshSession().then(() => socket.connect(), () => {});

    appointmentEvents.forEach((event) => socket.on(event, refetch));
    // A changed schedule changes the slots on offer, and the doctor list shows the schedule.
    socket.on("schedule:updated", () => {
      queryClient.invalidateQueries({ queryKey: ["slots"] });
      queryClient.invalidateQueries({ queryKey: ["doctors"] });
    });
    socket.on("connect", () => {
      renewedToken = false;
      setLive(true);
      // Screens just loaded their data, so only a reconnect needs a refetch (changes may have been missed).
      if (connectedBefore) refetch();
      connectedBefore = true;
    });
    socket.on("disconnect", (reason) => {
      if (reason === "io client disconnect") return; // this hook closing it
      setLive(false);
      // The server ends the connection when the access token runs out, and the client won't retry that by itself.
      if (reason === "io server disconnect") reconnectWithNewToken();
    });
    // The access token had expired when connecting: renew it and try once more.
    socket.on("connect_error", (err) => {
      setLive(false);
      if (err.message !== "UNAUTHORIZED" || renewedToken) return;
      renewedToken = true;
      reconnectWithNewToken();
    });

    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  return live;
}

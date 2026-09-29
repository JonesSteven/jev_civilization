import type { PendingView, presentGame, TribePanel } from "@/lib/server/present";
import type { TurnRecord } from "@/lib/server/turns";
import type { replayData } from "@/lib/server/replay";

export type GameView = ReturnType<typeof presentGame>;
export type EventCardView = NonNullable<GameView["event"]>;
export type { TribePanel, TurnRecord };
export type ReplayData = ReturnType<typeof replayData>;
export type { PendingView };

export interface ApiErrorBody {
  code: string;
  message: string;
  correlationId?: string;
}

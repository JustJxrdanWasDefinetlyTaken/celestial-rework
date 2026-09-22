declare module "@mercuryworkshop/epoxy-transport" {
  export const epoxyPath: string;
}

declare module "@mercuryworkshop/wisp-js/server" {
  export const server: {
    routeRequest(
      req: import("node:http").IncomingMessage,
      socket: import("node:stream").Duplex,
      head: Buffer,
    ): void;
  };

  export const logging: {
    NONE: number;
    set_level(level: number): void;
  };
}
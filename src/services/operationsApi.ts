import { operationsMockData } from "../mocks/operationsMockData";
import type { OperationsDashboardData } from "../domain/operations";

const DEMO_LATENCY_MS = 250;

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export const operationsApi = {
  async getDashboardData(): Promise<OperationsDashboardData> {
    await wait(DEMO_LATENCY_MS);
    return operationsMockData;
  },

  async postTeamsUpdate(): Promise<{ messageId: string; status: "posted" }> {
    await wait(DEMO_LATENCY_MS);
    return { messageId: "teams-msg-1042", status: "posted" };
  },

  async createJiraTask(): Promise<{ taskId: string; status: "created" }> {
    await wait(DEMO_LATENCY_MS);
    return { taskId: "OPS-482", status: "created" };
  },

  async sendCabBrief(): Promise<{ status: "sent" }> {
    await wait(DEMO_LATENCY_MS);
    return { status: "sent" };
  }
};

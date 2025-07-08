import { AmazonConnectApp, AppCreateEvent } from "@amazon-connect/app";
import { AgentClient } from "@amazon-connect/contact";

const VE_REDIRECT_URL = "{{VE_APP_URL}}"
const VE_CUSTOMER_DOMAIN = "{{VE_CUST_DOMAIN}}"

const { provider } = AmazonConnectApp.init(
    {
        onCreate: async (event: AppCreateEvent) => {
            const { appInstanceId } = event.context;
            console.log('VideoEngager ScheduleApp initialized: ', appInstanceId);
            const agent = new AgentClient()
            var arn = await agent.getARN()
            var agentName = (await agent.getName()).toLowerCase()
            var instanceId = arn.split("/")[1]
            console.log('VideoEngager ScheduleApp agentARN: ', arn);
            console.log('VideoEngager ScheduleApp agentName: ', agentName);
            console.log('VideoEngager ScheduleApp instanceId: ', instanceId);
            var appUrl = VE_REDIRECT_URL + "?agentEmail=" + instanceId + agentName + "@" + VE_CUSTOMER_DOMAIN.toLowerCase()
            console.log('VideoEngager ScheduleApp appUrl: ', appUrl);
            window.location.replace(appUrl)
        },
        onDestroy: async (event) => {
            console.log('VideoEngager ScheduleApp being destroyed');
        },
    }
);

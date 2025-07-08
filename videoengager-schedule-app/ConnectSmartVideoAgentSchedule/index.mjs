import fs from 'node:fs';
import mime from 'mime';

export const handler = async event => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  const agentEmail = event.queryStringParameters?.agentEmail
  const apiUrl = "https://" + event.requestContext.domainName + "/" + event.requestContext.stage
  const paths = event.path.split('/')
  const file_path = paths[paths.length - 1]
  const mime_type = mime.getType(file_path)
  const resp = GetResponse(mime_type, file_path, agentEmail, apiUrl)
  return resp;
};

function GetResponse(mediaType, fileName, agentEmail, apiUrl) {
  try {
    let data = fs.readFileSync(fileName, 'utf8');

    if (fileName === "schedule.html") {
      data = data
        .replace("{{AGENT_EMAIL}}", agentEmail.toLowerCase())
        .replace("{{LAMBDA_ENDPOINT}}", apiUrl + "/schedule")
    }

    if (fileName === "bundle.js") {
      data = data
        .replace("{{VE_APP_URL}}", "schedule.html")
        .replace("{{VE_CUST_DOMAIN}}", process.env.DOMAIN)
    }

    const response = {
      statusCode: 200,
      headers: {
        'Content-type': mediaType
      },
      body: data
    }
    return response
  } catch (err) {
    console.error(err);
  }
  return NotFoundResponse()
}

function NotFoundResponse() {
  const response = {
    statusCode: 404,
    body: "Not Found"
  }
  return response
}
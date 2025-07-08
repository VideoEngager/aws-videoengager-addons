import fs from 'node:fs';
import mime from 'mime';

export const handler = async event => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  let agentEmail = event.queryStringParameters?.agentEmail
  let apiUrl = "https://" + event.requestContext.domainName + "/" + event.requestContext.stage
  let paths = event.path.split('/')
  let file_path = paths[paths.length - 1]
  const mime_type = mime.getType(file_path)
  let resp = GetResponse(mime_type, file_path, agentEmail, apiUrl)
  return resp;
};

function GetResponse(mediaType, fileName, agentEmail, apiUrl) {
  try {
    var data = fs.readFileSync(fileName, 'utf8');

    if (fileName == "schedule.html") {
      data = data
        .replace("{{AGENT_EMAIL}}", agentEmail.toLowerCase())
        .replace("{{LAMBDA_ENDPOINT}}", apiUrl + "/schedule")
    }

    if (fileName == "bundle.js") {
      data = data
        .replace("{{VE_APP_URL}}", "schedule.html")
        .replace("{{VE_CUST_DOMAIN}}", process.env.DOMAIN)
    }

    let response = {
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
  let response = {
    statusCode: 404,
    body: "Not Found"
  }
  return response
}
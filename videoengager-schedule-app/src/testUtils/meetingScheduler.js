export const CONFIG = {
  lambdaEndpoint: "{{LAMBDA_ENDPOINT}}",
  agentEmail: "{{AGENT_EMAIL}}",
};

export function createNotification(message, type = "info", duration = 5000) {
  const container = document.getElementById("notificationContainer");
  const notification = document.createElement("div");

  const typeClasses = {
    success: "awsui-flash-success",
    error: "awsui-flash-error",
    warning: "awsui-flash-warning",
    info: "awsui-flash-info",
  };

  notification.className = `awsui-flash ${
    typeClasses[type] || typeClasses.info
  }`;
  notification.innerHTML = `
    <div style="padding-right: 20px;">${message}</div>
    <button type="button" class="awsui-flash-close" onclick="this.parentElement.remove()">×</button>
  `;

  container.appendChild(notification);
  return notification;
}

export function showSuccess(message, duration = 5000) {
  return createNotification(message, "success", duration);
}

export function showError(message, duration = 7000) {
  return createNotification(message, "error", duration);
}

export function getFormData() {
  const startTimeValue = document.getElementById("startTime").value;

  if (!startTimeValue) {
    throw new Error("Please select a start date and time");
  }

  return {
    agentEmail: CONFIG.agentEmail,
    date: new Date(startTimeValue).getTime(),
    duration: parseInt(document.getElementById("duration").value),
    visitor: {
      name: document.getElementById("visitorName").value.trim(),
      email: document.getElementById("visitorEmail").value.trim(),
      phone: document.getElementById("visitorPhone").value.trim(),
      subject: document.getElementById("meetingTitle").value.trim(),
    },
  };
}

export function validateForm() {
  const duration = parseInt(document.getElementById("duration").value);
  const startTime = document.getElementById("startTime").value;

  if (!startTime) {
    throw new Error("Please select a start date and time");
  }

  const selectedDate = new Date(startTime);
  const now = new Date();

  if (selectedDate <= now) {
    throw new Error("Please select a date in the future");
  }

  if (!duration || duration < 15) {
    throw new Error("Meeting duration must be at least 15 minutes");
  }

  const requiredFields = [
    { id: "visitorName", name: "Visitor Name" },
    { id: "visitorEmail", name: "Visitor Email" },
    { id: "visitorPhone", name: "Visitor Phone" },
  ];

  for (const field of requiredFields) {
    const value = document.getElementById(field.id).value.trim();
    if (!value) {
      throw new Error(`${field.name} is required`);
    }
  }
}

export async function callLambdaAPI(data) {
  const response = await fetch(CONFIG.lambdaEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!result.success || response.status !== 200) {
    throw new Error(result.message || "Unknown error occurred");
  }

  return result;
}

export function showResults(responseData) {
  document.getElementById("meetingId").textContent = responseData._id || "N/A";

  const startDate = new Date(responseData.date);
  const endDate = new Date(
    startDate.getTime() + responseData.duration * 60 * 1000
  );

  document.getElementById(
    "scheduledDate"
  ).textContent = `${startDate.toLocaleString()} - ${endDate.toLocaleString()}`;
  document.getElementById("scheduledDuration").textContent =
    responseData.duration || "Unknown";
  document.getElementById("scheduledVisitor").textContent =
    responseData.visitor?.name || "Unknown";
  document.getElementById("visitorUrl").value =
    responseData.visitor.meetingUrl || "URL not available";

  document.getElementById("meetingFormContainer").classList.add("hidden");
  document.getElementById("resultsContainer").classList.remove("hidden");
}

export function resetForm() {
  document.getElementById("meetingForm").reset();
  document.getElementById("duration").value = "30";
}

export function showForm() {
  document.getElementById("meetingFormContainer").classList.remove("hidden");
  document.getElementById("resultsContainer").classList.add("hidden");
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    // Fallback method
    const element = document.createElement("textarea");
    element.value = text;
    element.setAttribute("readonly", "");
    element.style.position = "absolute";
    element.style.left = "-9999px";
    document.body.appendChild(element);
    element.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(element);
    return copied;
  }
}

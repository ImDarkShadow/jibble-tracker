window.addEventListener("message", async (event) => {
    if (event.data.type !== "FETCH_TIMESHEETS") return;

    const response = await fetch(event.data.url, {
        credentials: "include",
        headers: {
            "Accept": "application/json, text/plain, */*",
            "Authorization": `Bearer ${event.data.token}`,
            "X-Jibble-App-Language": "en-US",
            "X-Jibble-App-Version": event.data.appVersion || "2.81.3",
            "X-Jibble-Web-Requests-Queued": "6"
        }
    });

    const data = await response.json();

    window.postMessage({
        type: "JIBBLE_TIMESHEET_RESULT",
        data
    }, "*");
});

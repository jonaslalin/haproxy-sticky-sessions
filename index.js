const { createServer, request: httpRequest } = require('http');
const os = require('os');

const hostname = os.hostname();
const serviceName = process.env['SERVICE_NAME'] || 'A';
const servicePort = +(process.env['SERVICE_PORT'] || '8080');
const sessionIdCookieName = `SESSION_ID_SERVICE_${serviceName}`;
const secureCookieAttribute =
  process.env['SECURE_COOKIE_ATTRIBUTE'] === 'true' || false;

function makeLoggingMiddleware(requestCounter) {
  function incomingRequestLoggingMiddleware(request) {
    console.log(`${requestCounter} - 1> Url:`, request.url);
    console.log(`${requestCounter} - 1> Cookie:`, request.headers['cookie']);
  }

  function outgoingRequestLoggingMiddleware(url, cookieString) {
    console.log(`${requestCounter} - 2> Url:`, url);
    console.log(`${requestCounter} - 2> Cookie:`, cookieString || undefined);
  }

  function incomingResponseLoggingMiddleware(response) {
    console.log(
      `${requestCounter} - 2< Set-Cookie:`,
      JSON.stringify(response.headers['set-cookie'], null, 2)
    );
  }

  function outgoingResponseLoggingMiddleware(response) {
    console.log(
      `${requestCounter} - 1< Set-Cookie:`,
      JSON.stringify(response.getHeader('Set-Cookie'), null, 2)
    );
  }

  return {
    incomingRequestLoggingMiddleware,
    outgoingRequestLoggingMiddleware,
    incomingResponseLoggingMiddleware,
    outgoingResponseLoggingMiddleware
  };
}

function makeSessionMiddleware() {
  const sessions = {};
  let sessionIdGenerator = 0;

  function sessionMiddleware(request, response) {
    return getSession(request) || createSession(response);
  }

  function getSession(request) {
    const cookieValueByName = getCookieValueByName(request);
    if (!cookieValueByName) {
      return null;
    }
    const sessionIds = cookieValueByName[sessionIdCookieName];
    if (!sessionIds) {
      return null;
    }
    const sessionId = sessionIds[0];
    const session = sessions[sessionId];
    if (!session) {
      return null;
    }
    return { sessionId, session };
  }

  function createSession(response) {
    const sessionId = `${hostname}-${sessionIdGenerator++}`;
    const session = { created: Date.now() };
    sessions[sessionId] = session;
    response.setHeader('Set-Cookie', [
      `${sessionIdCookieName}=${sessionId}` +
        '; Path=/' +
        '; HttpOnly' +
        (secureCookieAttribute ? '; Secure' : '') +
        '; SameSite=Lax'
    ]);
    return { sessionId, session };
  }

  return sessionMiddleware;
}

const sessionMiddleware = makeSessionMiddleware();

function getCookieValueByName(request) {
  const cookieString = request.headers['cookie'];
  if (!cookieString) {
    return null;
  }
  return cookieString
    .split(';')
    .map(cookiePair => cookiePair.trim().split('='))
    .reduce(
      (cookieValueByName, cookiePair) => ({
        ...cookieValueByName,
        [cookiePair[0]]: [
          ...(cookieValueByName[cookiePair[0]] || []),
          cookiePair[1]
        ]
      }),
      {}
    );
}

function getStrippedCookieString(request) {
  const cookieValueByName = getCookieValueByName(request);
  if (!cookieValueByName) {
    return null;
  }
  return (
    Object.entries(cookieValueByName)
      .filter(([name]) => name !== sessionIdCookieName)
      .map(cookiePair => cookiePair.join('='))
      .join('; ') || null
  );
}

function getStrippedSetCookieString(response) {
  const setCookieStrings = response.headers['set-cookie'];
  if (!setCookieStrings) {
    return null;
  }
  return setCookieStrings.filter(
    setCookieString => setCookieString.indexOf(sessionIdCookieName) < 0
  );
}

function getQueryParameter(request, name) {
  const { searchParams } = new URL(
    request.url,
    `http://${hostname}:${servicePort}/`
  );
  return searchParams.get(name);
}

let requestCounter = 0;

createServer()
  .on('request', (incomingRequest, outgoingResponse) => {
    const {
      incomingRequestLoggingMiddleware,
      outgoingRequestLoggingMiddleware,
      incomingResponseLoggingMiddleware,
      outgoingResponseLoggingMiddleware
    } = makeLoggingMiddleware(requestCounter++);

    incomingRequestLoggingMiddleware(incomingRequest);

    const { sessionId, session } = sessionMiddleware(
      incomingRequest,
      outgoingResponse
    );
    session.call_counter = (session.call_counter || 0) + 1;

    const url = getQueryParameter(incomingRequest, 'call');
    if (url) {
      const strippedCookieString = getStrippedCookieString(incomingRequest);
      let headers = {};
      if (strippedCookieString) {
        headers['Cookie'] = strippedCookieString;
      }

      outgoingRequestLoggingMiddleware(url, strippedCookieString);

      httpRequest(url, { headers })
        .on('response', incomingResponse => {
          incomingResponseLoggingMiddleware(incomingResponse);

          const strippedSetCookieString = getStrippedSetCookieString(
            incomingResponse
          );
          if (strippedSetCookieString && strippedSetCookieString.length > 0) {
            const currentSetCookieString =
              outgoingResponse.getHeader('Set-Cookie') || [];
            outgoingResponse.setHeader('Set-Cookie', [
              ...currentSetCookieString,
              ...strippedSetCookieString
            ]);
          }

          let incomingData = '';
          incomingResponse
            .on('data', chunk => (incomingData += chunk))
            .on('end', () => {
              outgoingResponse.writeHead(200, {
                'Content-Type': 'application/json'
              });
              outgoingResponse.end(
                JSON.stringify({
                  service_name: serviceName,
                  session_id: sessionId,
                  session,
                  response: JSON.parse(incomingData)
                })
              );

              outgoingResponseLoggingMiddleware(outgoingResponse);
            });
        })
        .end();
    } else {
      outgoingResponse.writeHead(200, { 'Content-Type': 'application/json' });
      outgoingResponse.end(
        JSON.stringify({
          service_name: serviceName,
          session_id: sessionId,
          session
        })
      );

      outgoingResponseLoggingMiddleware(outgoingResponse);
    }
  })
  .listen(servicePort);

console.log(`Service ${serviceName} started on ${hostname}:${servicePort}.`);

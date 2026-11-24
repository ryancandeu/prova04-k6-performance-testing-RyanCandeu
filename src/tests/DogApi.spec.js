import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/latest/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const baseUrl = 'https://dogapi.dog/api/v2';

export const getBreedsDuration = new Trend('get_breeds', true);
export const getGroupsDuration = new Trend('get_groups', true);
export const getFactsDuration = new Trend('get_facts', true);
export const RateContentOK = new Rate('content_OK');

export const options = {
  scenarios: {
    dog_api_test: {
      executor: 'ramping-vus',
      startVUs: 7,
      gracefulStop: '0s',
      stages: [
        { duration: '30s', target: 7 },
        { duration: '2m30s', target: 92 },
        { duration: '30s', target: 0 }
      ]
    }
  },
  thresholds: {
    http_req_duration: ['p(90)<6800'],
    http_req_failed: ['rate<0.25']
  }
};

const params = {
  headers: {
    Accept: 'application/vnd.api+json, application/json'
  },
  timeout: '10s'
};

function hasJsonContentType(response) {
  const contentType =
    response.headers['Content-Type'] || response.headers['content-type'] || '';

  const normalizedContentType = contentType.toLowerCase();

  return (
    normalizedContentType.includes('application/json') ||
    normalizedContentType.includes('application/vnd.api+json')
  );
}

function hasValidCollection(response, expectedType) {
  try {
    const body = response.json();

    return (
      Array.isArray(body.data) &&
      body.data.length > 0 &&
      body.data.every(
        item =>
          typeof item.id === 'string' &&
          item.id.length > 0 &&
          item.type === expectedType &&
          item.attributes !== null &&
          typeof item.attributes === 'object'
      )
    );
  } catch (error) {
    return false;
  }
}

function executeBreedsTest() {
  group('Dog API - Listar raças', function () {
    const response = http.get(
      `${baseUrl}/breeds?page[number]=1&page[size]=10`,
      {
        ...params,
        tags: {
          endpoint: 'breeds'
        }
      }
    );

    getBreedsDuration.add(response.timings.duration, {
      endpoint: 'breeds'
    });

    const contentOK = check(
      response,
      {
        'GET Breeds - Status 200': response => response.status === 200,

        'GET Breeds - Tempo menor que 6800ms': response =>
          response.timings.duration < 6800,

        'GET Breeds - Content-Type JSON': response =>
          hasJsonContentType(response),

        'GET Breeds - Retornou raças válidas': response =>
          hasValidCollection(response, 'breed'),

        'GET Breeds - Possui paginação': response => {
          try {
            const body = response.json();

            return (
              body.meta !== null &&
              typeof body.meta === 'object' &&
              body.meta.pagination !== null &&
              typeof body.meta.pagination === 'object' &&
              typeof body.meta.pagination.current === 'number' &&
              typeof body.meta.pagination.records === 'number' &&
              body.meta.pagination.current >= 1 &&
              body.meta.pagination.records > 0
            );
          } catch (error) {
            return false;
          }
        }
      },
      {
        endpoint: 'breeds'
      }
    );

    RateContentOK.add(contentOK, {
      endpoint: 'breeds'
    });
  });
}

function executeGroupsTest() {
  group('Dog API - Listar grupos', function () {
    const response = http.get(
      `${baseUrl}/groups?page[number]=1&page[size]=20`,
      {
        ...params,
        tags: {
          endpoint: 'groups'
        }
      }
    );

    getGroupsDuration.add(response.timings.duration, {
      endpoint: 'groups'
    });

    const contentOK = check(
      response,
      {
        'GET Groups - Status 200': response => response.status === 200,

        'GET Groups - Tempo menor que 6800ms': response =>
          response.timings.duration < 6800,

        'GET Groups - Content-Type JSON': response =>
          hasJsonContentType(response),

        'GET Groups - Retornou grupos válidos': response =>
          hasValidCollection(response, 'group'),

        'GET Groups - Grupos possuem nome': response => {
          try {
            const body = response.json();

            return body.data.every(
              dogGroup =>
                typeof dogGroup.attributes.name === 'string' &&
                dogGroup.attributes.name.trim().length > 0
            );
          } catch (error) {
            return false;
          }
        },

        'GET Groups - Relacionamento com raças válido': response => {
          try {
            const body = response.json();

            return body.data.every(
              dogGroup =>
                dogGroup.relationships !== null &&
                typeof dogGroup.relationships === 'object' &&
                dogGroup.relationships.breeds !== null &&
                typeof dogGroup.relationships.breeds === 'object' &&
                Array.isArray(dogGroup.relationships.breeds.data)
            );
          } catch (error) {
            return false;
          }
        }
      },
      {
        endpoint: 'groups'
      }
    );

    RateContentOK.add(contentOK, {
      endpoint: 'groups'
    });
  });
}

function executeFactsTest() {
  group('Dog API - Consultar fatos', function () {
    const response = http.get(`${baseUrl}/facts?limit=5`, {
      ...params,
      tags: {
        endpoint: 'facts'
      }
    });

    getFactsDuration.add(response.timings.duration, {
      endpoint: 'facts'
    });

    const contentOK = check(
      response,
      {
        'GET Facts - Status 200': response => response.status === 200,

        'GET Facts - Tempo menor que 6800ms': response =>
          response.timings.duration < 6800,

        'GET Facts - Content-Type JSON': response =>
          hasJsonContentType(response),

        'GET Facts - Retornou fatos válidos': response =>
          hasValidCollection(response, 'fact'),

        'GET Facts - Retornou de 1 até 5 fatos': response => {
          try {
            const body = response.json();

            return body.data.length >= 1 && body.data.length <= 5;
          } catch (error) {
            return false;
          }
        },

        'GET Facts - Fatos possuem texto': response => {
          try {
            const body = response.json();

            return body.data.every(
              fact =>
                typeof fact.attributes.body === 'string' &&
                fact.attributes.body.trim().length > 0
            );
          } catch (error) {
            return false;
          }
        }
      },
      {
        endpoint: 'facts'
      }
    );

    RateContentOK.add(contentOK, {
      endpoint: 'facts'
    });
  });
}

export function handleSummary(data) {
  return {
    './src/output/dog-api-report.html': htmlReport(data),

    stdout: textSummary(data, {
      indent: ' ',
      enableColors: true
    })
  };
}

export default function () {
  const endpointIndex = (__VU + __ITER) % 3;

  if (endpointIndex === 0) {
    executeBreedsTest();
  } else if (endpointIndex === 1) {
    executeGroupsTest();
  } else {
    executeFactsTest();
  }

  sleep(20);
}

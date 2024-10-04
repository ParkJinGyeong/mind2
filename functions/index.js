/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {onRequest} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });


const functions = require('firebase-functions');
const { WebhookClient } = require('dialogflow-fulfillment');
const { SessionsClient } = require('@google-cloud/dialogflow'); // Dialogflow Detect Intent API 사용
const admin = require('firebase-admin');

// 1. Firebase Admin SDK 초기화 (Client Sub-agent의 Service Account JSON 파일 사용)
const clientServiceAccount = require('./client-tcmk-key.json'); // Client Sub-agent의 Service Account JSON 파일 경로 설정

admin.initializeApp({
  credential: admin.credential.cert(clientServiceAccount),
});

// 2. Counselor Sub-agent의 Service Account JSON 파일 경로 설정
const counselorServiceAccount = require('./counselor-xibw-key.json'); // Counselor Sub-agent의 Service Account JSON 파일 경로 설정

// 3. Counselor Sub-agent의 SessionsClient 초기화 (Counselor Sub-agent의 Service Account 인증 정보 사용)
const counselorSessionClient = new SessionsClient({
  credentials: {
    client_email: counselorServiceAccount.client_email,  // Counselor 서비스 계정의 이메일
    private_key: counselorServiceAccount.private_key,     // Counselor 서비스 계정의 개인 키
  },
});

// 4. Counselor Sub-agent의 Project ID 및 Session Path 설정
const counselorProjectId = 'counselor-xibw'; // Counselor Sub-agent의 GCP 프로젝트 ID
const counselorSessionId = 'counselor1'; // Counselor Sub-agent와의 고유 세션 ID (필요에 따라 변경 가능)
const counselorSessionPath = `projects/counselor-xibw/agent/sessions/counselor1`; // Counselor Sub-agent의 Session Path 설정

// 5. 사용자 입력을 Counselor Sub-agent에 전달하는 함수
async function sendMessageToCounselorAgent(userInput) {
  const request = {
    session: counselorSessionPath,
    queryInput: {
      text: {
        text: userInput, // Client에서 입력된 사용자 메시지
        languageCode: 'ko', // 언어 코드 설정 (예: 한국어 'ko')
      },
    },
    // Intent를 여기서 설정
    intent: 'projects/counselor-xibw/agent/intents/HandleClientMessage', // Intent 추가
  };
  
  // Counselor Sub-agent의 Detect Intent API 호출
  try {
    const [response] = await counselorSessionClient.detectIntent(request);
    console.log('Counselor Agent Response:', response.queryResult.fulfillmentText); // Counselor의 응답 출력
    return response.queryResult.fulfillmentText; // Counselor의 응답 반환 (필요하지 않으면 생략 가능)
  } catch (error) {
    console.error('Error in sending message to Counselor Agent:', error);
    throw new Error('Failed to send message to Counselor Agent');
  }
}

// 6. Cloud Functions HTTP 트리거 설정
exports.dialogflowFirebaseFulfillment = functions.https.onRequest(async (request, response) => {
  const agent = new WebhookClient({ request, response });

  // 7. SendMessageToCounselor Intent 처리
  async function sendMessageToCounselor(agent) {
    // 사용자가 Client Sub-agent에 입력한 메시지 가져오기
    const userMessage = agent.queryText;

    try {
      // 사용자의 메시지를 Counselor Sub-agent에 전달
      await sendMessageToCounselorAgent(userMessage);
      console.log(`Message from Client forwarded to Counselor: ${userMessage}`);

      // Client Sub-agent에게 단순 응답 (상담사에게 전달됨을 알림)
      agent.add('상담사에게 메시지를 전달했습니다.');
    } catch (error) {
      console.error('Failed to process Client message:', error);
      agent.add('Counselor에게 메시지를 전달하는 데 실패했습니다.');
    }
  }

  // 8. Intent Map 설정 및 함수 매핑
  let intentMap = new Map();
  intentMap.set('SendMessageToCounselor', sendMessageToCounselor); // 'SendMessageToCounselor' Intent와 sendMessageToCounselor 함수 연결

  // 9. Intent Map을 기반으로 Dialogflow Agent의 요청 처리
  agent.handleRequest(intentMap);
});

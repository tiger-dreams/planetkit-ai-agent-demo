import { Language } from '@/contexts/LanguageContext';

export interface Translations {
  // Common
  cancel: string;
  confirm: string;
  save: string;
  close: string;
  error: string;
  success: string;
  loading: string;

  // Setup Page
  setupTitle: string;
  setupDescription: string;
  liffLogin: string;
  liffLoginDescription: string;
  loginWithLine: string;
  logoutFromLine: string;
  configuration: string;
  configurationDescription: string;
  environment: string;
  environmentDescription: string;
  evaluationEnv: string;
  realEnv: string;
  serviceId: string;
  apiKey: string;
  apiSecret: string;
  userId: string;
  displayName: string;
  displayNamePlaceholder: string;
  displayNameDescription: string;
  room: string;
  roomDescription: string;
  roomJapan: string;
  roomKorea: string;
  roomTaiwan: string;
  roomThailand: string;
  roomCustom: string;
  roomCustomPlaceholder: string;
  tokenGeneration: string;
  tokenGenerationDescription: string;
  generateToken: string;
  tokenGenerated: string;
  tokenNotGenerated: string;
  joinMeeting: string;
  pleaseGenerateToken: string;

  // Meeting Area
  participants: string;
  duration: string;
  connecting: string;
  connected: string;
  disconnected: string;
  connectionFailed: string;
  videoOn: string;
  videoOff: string;
  audioOn: string;
  audioOff: string;
  screenShare: string;
  leaveMeeting: string;
  localUser: string;
  remoteUser: string;
  you: string;
  speaking: string;

  // Config Panel
  planetkitConfig: string;
  planetkitConfigDescription: string;
  requiredFields: string;
  optionalFields: string;
  currentConfig: string;
  notConfigured: string;
  tokenStatus: string;

  // Errors
  tokenGenerationFailed: string;
  connectionError: string;
  mediaDeviceError: string;
  permissionDenied: string;

  // Toast messages
  tokenGeneratedSuccess: string;
  configSaved: string;
  joinedMeeting: string;
  leftMeeting: string;
  connectionSuccessTitle: string;
  connectionSuccessDescription: string;
  callEndedTitle: string;
  callEndedDescription: string;

  // Validation messages
  pleaseSelectEnvironment: string;
  pleaseSelectRoom: string;

  // Footer messages
  appDescription: string;
}

export const translations: Record<Language, Translations> = {
  ko: {
    // Common
    cancel: '취소',
    confirm: '확인',
    save: '저장',
    close: '닫기',
    error: '오류',
    success: '성공',
    loading: '로딩 중...',

    // Setup Page
    setupTitle: 'Viva Connect - 화상회의 설정',
    setupDescription: '화상회의를 시작하기 위해 아래 설정을 완료하세요.',
    liffLogin: 'LINE 로그인',
    liffLoginDescription: 'LINE 계정으로 로그인하여 프로필 정보를 자동으로 가져옵니다.',
    loginWithLine: 'LINE으로 로그인',
    logoutFromLine: 'LINE 로그아웃',
    configuration: '설정',
    configurationDescription: 'PlanetKit 환경 및 방 설정을 구성합니다.',
    environment: '환경',
    environmentDescription: 'Evaluation 환경은 테스트용, Real 환경은 실제 서비스용입니다.',
    evaluationEnv: '평가 환경 (테스트)',
    realEnv: '실제 환경 (프로덕션)',
    serviceId: '서비스 ID',
    apiKey: 'API Key',
    apiSecret: 'API Secret',
    userId: '사용자 ID',
    displayName: '표시 이름',
    displayNamePlaceholder: '표시 이름을 입력하세요',
    displayNameDescription: '다른 참가자에게 표시될 이름입니다. (LINE 프로필 이름이 자동 설정됨)',
    room: '방',
    roomDescription: '참여할 방을 선택하세요. 같은 방의 사용자들끼리 통화할 수 있습니다.',
    roomJapan: '일본',
    roomKorea: '한국',
    roomTaiwan: '대만',
    roomThailand: '태국',
    roomCustom: '커스텀 룸',
    roomCustomPlaceholder: '룸 ID를 입력하세요',
    tokenGeneration: '토큰 생성',
    tokenGenerationDescription: '회의 참여를 위한 액세스 토큰을 생성합니다.',
    generateToken: '토큰 생성',
    tokenGenerated: '토큰이 생성되었습니다',
    tokenNotGenerated: '토큰이 생성되지 않았습니다',
    joinMeeting: '회의 참여',
    pleaseGenerateToken: '먼저 토큰을 생성해주세요.',

    // Meeting Area
    participants: '참가자',
    duration: '통화 시간',
    connecting: '연결 중...',
    connected: '연결됨',
    disconnected: '연결 끊김',
    connectionFailed: '연결 실패',
    videoOn: '비디오 켜기',
    videoOff: '비디오 끄기',
    audioOn: '오디오 켜기',
    audioOff: '오디오 끄기',
    screenShare: '화면 공유',
    leaveMeeting: '회의 나가기',
    localUser: '나',
    remoteUser: '참가자',
    you: '나',
    speaking: '말하는 중',

    // Config Panel
    planetkitConfig: 'PlanetKit 설정',
    planetkitConfigDescription: '환경, 방, 토큰 등을 설정합니다.',
    requiredFields: '필수 항목',
    optionalFields: '선택 항목',
    currentConfig: '현재 설정',
    notConfigured: '설정되지 않음',
    tokenStatus: '토큰 상태',

    // Errors
    tokenGenerationFailed: '토큰 생성에 실패했습니다',
    connectionError: '연결 오류가 발생했습니다',
    mediaDeviceError: '미디어 장치에 접근할 수 없습니다',
    permissionDenied: '권한이 거부되었습니다',

    // Toast messages
    tokenGeneratedSuccess: '토큰이 성공적으로 생성되었습니다',
    configSaved: '설정이 저장되었습니다',
    joinedMeeting: '회의에 참여했습니다',
    leftMeeting: '회의에서 나갔습니다',
    connectionSuccessTitle: '연결 성공',
    connectionSuccessDescription: 'PlanetKit Conference에 성공적으로 연결되었습니다.',
    callEndedTitle: '통화 종료',
    callEndedDescription: '미디어 장치가 해제되었습니다.',

    // Validation messages
    pleaseSelectEnvironment: '⚠️ 환경을 선택해주세요',
    pleaseSelectRoom: '⚠️ Room을 선택해주세요',

    // Footer messages
    appDescription: '💡 이 앱은 LINE Planet PlanetKit Web SDK를 사용한 테스트용 LIFF 앱입니다.',
  },
  en: {
    // Common
    cancel: 'Cancel',
    confirm: 'Confirm',
    save: 'Save',
    close: 'Close',
    error: 'Error',
    success: 'Success',
    loading: 'Loading...',

    // Setup Page
    setupTitle: 'Viva Connect - Video Conference Setup',
    setupDescription: 'Complete the setup below to start your video conference.',
    liffLogin: 'LINE Login',
    liffLoginDescription: 'Log in with your LINE account to automatically import your profile information.',
    loginWithLine: 'Login with LINE',
    logoutFromLine: 'Logout from LINE',
    configuration: 'Configuration',
    configurationDescription: 'Configure PlanetKit environment and room settings.',
    environment: 'Environment',
    environmentDescription: 'Evaluation environment is for testing, Real environment is for production.',
    evaluationEnv: 'Evaluation (Testing)',
    realEnv: 'Real (Production)',
    serviceId: 'Service ID',
    apiKey: 'API Key',
    apiSecret: 'API Secret',
    userId: 'User ID',
    displayName: 'Display Name',
    displayNamePlaceholder: 'Enter your display name',
    displayNameDescription: 'The name that will be displayed to other participants. (LINE profile name is set automatically)',
    room: 'Room',
    roomDescription: 'Select a room to join. Users in the same room can communicate with each other.',
    roomJapan: 'Japan',
    roomKorea: 'Korea',
    roomTaiwan: 'Taiwan',
    roomThailand: 'Thailand',
    roomCustom: 'Custom Room',
    roomCustomPlaceholder: 'Enter room ID',
    tokenGeneration: 'Token Generation',
    tokenGenerationDescription: 'Generate an access token to join the meeting.',
    generateToken: 'Generate Token',
    tokenGenerated: 'Token has been generated',
    tokenNotGenerated: 'Token has not been generated',
    joinMeeting: 'Join Meeting',
    pleaseGenerateToken: 'Please generate a token first.',

    // Meeting Area
    participants: 'Participants',
    duration: 'Duration',
    connecting: 'Connecting...',
    connected: 'Connected',
    disconnected: 'Disconnected',
    connectionFailed: 'Connection Failed',
    videoOn: 'Turn On Video',
    videoOff: 'Turn Off Video',
    audioOn: 'Turn On Audio',
    audioOff: 'Turn Off Audio',
    screenShare: 'Share Screen',
    leaveMeeting: 'Leave Meeting',
    localUser: 'Me',
    remoteUser: 'Participant',
    you: 'You',
    speaking: 'Speaking',

    // Config Panel
    planetkitConfig: 'PlanetKit Configuration',
    planetkitConfigDescription: 'Configure environment, room, token, etc.',
    requiredFields: 'Required Fields',
    optionalFields: 'Optional Fields',
    currentConfig: 'Current Configuration',
    notConfigured: 'Not Configured',
    tokenStatus: 'Token Status',

    // Errors
    tokenGenerationFailed: 'Failed to generate token',
    connectionError: 'Connection error occurred',
    mediaDeviceError: 'Cannot access media devices',
    permissionDenied: 'Permission denied',

    // Toast messages
    tokenGeneratedSuccess: 'Token generated successfully',
    configSaved: 'Configuration saved',
    joinedMeeting: 'Joined meeting',
    leftMeeting: 'Left meeting',
    connectionSuccessTitle: 'Connected Successfully',
    connectionSuccessDescription: 'Successfully connected to PlanetKit Conference.',
    callEndedTitle: 'Call Ended',
    callEndedDescription: 'Media devices have been released.',

    // Validation messages
    pleaseSelectEnvironment: '⚠️ Please select an environment',
    pleaseSelectRoom: '⚠️ Please select a room',

    // Footer messages
    appDescription: '💡 This is a test LIFF app using the LINE Planet PlanetKit Web SDK.',
  },
  ja: {
    // Common
    cancel: 'キャンセル',
    confirm: '確認',
    save: '保存',
    close: '閉じる',
    error: 'エラー',
    success: '成功',
    loading: '読み込み中...',

    // Setup Page
    setupTitle: 'Viva Connect - ビデオ会議設定',
    setupDescription: 'ビデオ会議を開始するために以下の設定を完了してください。',
    liffLogin: 'LINEログイン',
    liffLoginDescription: 'LINEアカウントでログインしてプロフィール情報を自動取得します。',
    loginWithLine: 'LINEでログイン',
    logoutFromLine: 'LINEからログアウト',
    configuration: '設定',
    configurationDescription: 'PlanetKit環境とルームの設定を構成します。',
    environment: '環境',
    environmentDescription: 'Evaluation環境はテスト用、Real環境は本番用です。',
    evaluationEnv: '評価環境（テスト）',
    realEnv: '本番環境（プロダクション）',
    serviceId: 'サービスID',
    apiKey: 'APIキー',
    apiSecret: 'APIシークレット',
    userId: 'ユーザーID',
    displayName: '表示名',
    displayNamePlaceholder: '表示名を入力してください',
    displayNameDescription: '他の参加者に表示される名前です。（LINEプロフィール名が自動設定されます）',
    room: 'ルーム',
    roomDescription: '参加するルームを選択してください。同じルームのユーザー同士で通話できます。',
    roomJapan: '日本',
    roomKorea: '韓国',
    roomTaiwan: '台湾',
    roomThailand: 'タイ',
    roomCustom: 'カスタムルーム',
    roomCustomPlaceholder: 'ルームIDを入力してください',
    tokenGeneration: 'トークン生成',
    tokenGenerationDescription: '会議参加用のアクセストークンを生成します。',
    generateToken: 'トークン生成',
    tokenGenerated: 'トークンが生成されました',
    tokenNotGenerated: 'トークンが生成されていません',
    joinMeeting: '会議に参加',
    pleaseGenerateToken: '最初にトークンを生成してください。',

    // Meeting Area
    participants: '参加者',
    duration: '通話時間',
    connecting: '接続中...',
    connected: '接続済み',
    disconnected: '切断',
    connectionFailed: '接続失敗',
    videoOn: 'ビデオをオンにする',
    videoOff: 'ビデオをオフにする',
    audioOn: 'オーディオをオンにする',
    audioOff: 'オーディオをオフにする',
    screenShare: '画面共有',
    leaveMeeting: '会議を退出',
    localUser: '自分',
    remoteUser: '参加者',
    you: '自分',
    speaking: '話し中',

    // Config Panel
    planetkitConfig: 'PlanetKit設定',
    planetkitConfigDescription: '環境、ルーム、トークンなどを設定します。',
    requiredFields: '必須項目',
    optionalFields: '任意項目',
    currentConfig: '現在の設定',
    notConfigured: '未設定',
    tokenStatus: 'トークン状態',

    // Errors
    tokenGenerationFailed: 'トークンの生成に失敗しました',
    connectionError: '接続エラーが発生しました',
    mediaDeviceError: 'メディアデバイスにアクセスできません',
    permissionDenied: '権限が拒否されました',

    // Toast messages
    tokenGeneratedSuccess: 'トークンが正常に生成されました',
    configSaved: '設定が保存されました',
    joinedMeeting: '会議に参加しました',
    leftMeeting: '会議を退出しました',
    connectionSuccessTitle: '接続成功',
    connectionSuccessDescription: 'PlanetKit Conferenceに正常に接続されました。',
    callEndedTitle: '通話終了',
    callEndedDescription: 'メディアデバイスが解放されました。',

    // Validation messages
    pleaseSelectEnvironment: '⚠️ 環境を選択してください',
    pleaseSelectRoom: '⚠️ ルームを選択してください',

    // Footer messages
    appDescription: '💡 このアプリはLINE Planet PlanetKit Web SDKを使用したテスト用LIFFアプリです。',
  },
  th: {
    // Common
    cancel: 'ยกเลิก',
    confirm: 'ยืนยัน',
    save: 'บันทึก',
    close: 'ปิด',
    error: 'ข้อผิดพลาด',
    success: 'สำเร็จ',
    loading: 'กำลังโหลด...',

    // Setup Page
    setupTitle: 'Viva Connect - ตั้งค่าการประชุมทางวิดีโอ',
    setupDescription: 'กรอกข้อมูลด้านล่างเพื่อเริ่มการประชุมทางวิดีโอ',
    liffLogin: 'เข้าสู่ระบบ LINE',
    liffLoginDescription: 'เข้าสู่ระบบด้วยบัญชี LINE เพื่อดึงข้อมูลโปรไฟล์อัตโนมัติ',
    loginWithLine: 'เข้าสู่ระบบด้วย LINE',
    logoutFromLine: 'ออกจากระบบ LINE',
    configuration: 'การตั้งค่า',
    configurationDescription: 'กำหนดค่าสภาพแวดล้อม PlanetKit และห้องประชุม',
    environment: 'สภาพแวดล้อม',
    environmentDescription: 'สภาพแวดล้อม Evaluation สำหรับทดสอบ, Real สำหรับใช้งานจริง',
    evaluationEnv: 'สภาพแวดล้อมทดสอบ',
    realEnv: 'สภาพแวดล้อมจริง (Production)',
    serviceId: 'Service ID',
    apiKey: 'API Key',
    apiSecret: 'API Secret',
    userId: 'รหัสผู้ใช้',
    displayName: 'ชื่อที่แสดง',
    displayNamePlaceholder: 'กรอกชื่อที่แสดง',
    displayNameDescription: 'ชื่อที่ผู้เข้าร่วมคนอื่นจะเห็น (ชื่อโปรไฟล์ LINE จะถูกกำหนดอัตโนมัติ)',
    room: 'ห้องประชุม',
    roomDescription: 'เลือกห้องที่ต้องการเข้าร่วม ผู้ใช้ในห้องเดียวกันสามารถสื่อสารกันได้',
    roomJapan: 'ญี่ปุ่น',
    roomKorea: 'เกาหลี',
    roomTaiwan: 'ไต้หวัน',
    roomThailand: 'ไทย',
    roomCustom: 'ห้องกำหนดเอง',
    roomCustomPlaceholder: 'กรอก Room ID',
    tokenGeneration: 'สร้าง Token',
    tokenGenerationDescription: 'สร้าง Access Token เพื่อเข้าร่วมการประชุม',
    generateToken: 'สร้าง Token',
    tokenGenerated: 'สร้าง Token สำเร็จ',
    tokenNotGenerated: 'ยังไม่ได้สร้าง Token',
    joinMeeting: 'เข้าร่วมประชุม',
    pleaseGenerateToken: 'กรุณาสร้าง Token ก่อน',

    // Meeting Area
    participants: 'ผู้เข้าร่วม',
    duration: 'ระยะเวลา',
    connecting: 'กำลังเชื่อมต่อ...',
    connected: 'เชื่อมต่อแล้ว',
    disconnected: 'ตัดการเชื่อมต่อ',
    connectionFailed: 'การเชื่อมต่อล้มเหลว',
    videoOn: 'เปิดวิดีโอ',
    videoOff: 'ปิดวิดีโอ',
    audioOn: 'เปิดเสียง',
    audioOff: 'ปิดเสียง',
    screenShare: 'แชร์หน้าจอ',
    leaveMeeting: 'ออกจากการประชุม',
    localUser: 'ฉัน',
    remoteUser: 'ผู้เข้าร่วม',
    you: 'คุณ',
    speaking: 'กำลังพูด',

    // Config Panel
    planetkitConfig: 'การตั้งค่า PlanetKit',
    planetkitConfigDescription: 'ตั้งค่าสภาพแวดล้อม ห้อง Token และอื่นๆ',
    requiredFields: 'ฟิลด์ที่จำเป็น',
    optionalFields: 'ฟิลด์เพิ่มเติม',
    currentConfig: 'การตั้งค่าปัจจุบัน',
    notConfigured: 'ยังไม่ได้ตั้งค่า',
    tokenStatus: 'สถานะ Token',

    // Errors
    tokenGenerationFailed: 'ไม่สามารถสร้าง Token ได้',
    connectionError: 'เกิดข้อผิดพลาดในการเชื่อมต่อ',
    mediaDeviceError: 'ไม่สามารถเข้าถึงอุปกรณ์มีเดียได้',
    permissionDenied: 'การอนุญาตถูกปฏิเสธ',

    // Toast messages
    tokenGeneratedSuccess: 'สร้าง Token สำเร็จ',
    configSaved: 'บันทึกการตั้งค่าแล้ว',
    joinedMeeting: 'เข้าร่วมการประชุมแล้ว',
    leftMeeting: 'ออกจากการประชุมแล้ว',
    connectionSuccessTitle: 'เชื่อมต่อสำเร็จ',
    connectionSuccessDescription: 'เชื่อมต่อกับ PlanetKit Conference สำเร็จ',
    callEndedTitle: 'สิ้นสุดการโทร',
    callEndedDescription: 'อุปกรณ์มีเดียได้รับการปล่อยแล้ว',

    // Validation messages
    pleaseSelectEnvironment: '⚠️ กรุณาเลือกสภาพแวดล้อม',
    pleaseSelectRoom: '⚠️ กรุณาเลือกห้องประชุม',

    // Footer messages
    appDescription: '💡 แอปนี้เป็น LIFF แอปทดสอบที่ใช้ LINE Planet PlanetKit Web SDK',
  },
  'zh-TW': {
    // Common
    cancel: '取消',
    confirm: '確認',
    save: '儲存',
    close: '關閉',
    error: '錯誤',
    success: '成功',
    loading: '載入中...',

    // Setup Page
    setupTitle: 'Viva Connect - 視訊會議設定',
    setupDescription: '請完成以下設定以開始視訊會議。',
    liffLogin: 'LINE 登入',
    liffLoginDescription: '使用 LINE 帳號登入以自動取得個人資料。',
    loginWithLine: '使用 LINE 登入',
    logoutFromLine: '登出 LINE',
    configuration: '設定',
    configurationDescription: '設定 PlanetKit 環境與會議室。',
    environment: '環境',
    environmentDescription: 'Evaluation 環境用於測試，Real 環境用於正式服務。',
    evaluationEnv: '評估環境（測試）',
    realEnv: '正式環境（Production）',
    serviceId: '服務 ID',
    apiKey: 'API Key',
    apiSecret: 'API Secret',
    userId: '使用者 ID',
    displayName: '顯示名稱',
    displayNamePlaceholder: '請輸入顯示名稱',
    displayNameDescription: '其他參與者看到的名稱（LINE 個人資料名稱將自動設定）',
    room: '會議室',
    roomDescription: '選擇要加入的會議室，同一會議室的使用者可以互相通話。',
    roomJapan: '日本',
    roomKorea: '韓國',
    roomTaiwan: '台灣',
    roomThailand: '泰國',
    roomCustom: '自訂會議室',
    roomCustomPlaceholder: '請輸入會議室 ID',
    tokenGeneration: '產生 Token',
    tokenGenerationDescription: '產生加入會議所需的存取 Token。',
    generateToken: '產生 Token',
    tokenGenerated: 'Token 已產生',
    tokenNotGenerated: 'Token 尚未產生',
    joinMeeting: '加入會議',
    pleaseGenerateToken: '請先產生 Token。',

    // Meeting Area
    participants: '參與者',
    duration: '通話時間',
    connecting: '連線中...',
    connected: '已連線',
    disconnected: '已斷線',
    connectionFailed: '連線失敗',
    videoOn: '開啟視訊',
    videoOff: '關閉視訊',
    audioOn: '開啟音訊',
    audioOff: '關閉音訊',
    screenShare: '分享螢幕',
    leaveMeeting: '離開會議',
    localUser: '我',
    remoteUser: '參與者',
    you: '您',
    speaking: '說話中',

    // Config Panel
    planetkitConfig: 'PlanetKit 設定',
    planetkitConfigDescription: '設定環境、會議室、Token 等。',
    requiredFields: '必填欄位',
    optionalFields: '選填欄位',
    currentConfig: '目前設定',
    notConfigured: '未設定',
    tokenStatus: 'Token 狀態',

    // Errors
    tokenGenerationFailed: 'Token 產生失敗',
    connectionError: '發生連線錯誤',
    mediaDeviceError: '無法存取媒體裝置',
    permissionDenied: '權限被拒絕',

    // Toast messages
    tokenGeneratedSuccess: 'Token 已成功產生',
    configSaved: '設定已儲存',
    joinedMeeting: '已加入會議',
    leftMeeting: '已離開會議',
    connectionSuccessTitle: '連線成功',
    connectionSuccessDescription: '已成功連線至 PlanetKit Conference。',
    callEndedTitle: '通話結束',
    callEndedDescription: '媒體裝置已釋放。',

    // Validation messages
    pleaseSelectEnvironment: '⚠️ 請選擇環境',
    pleaseSelectRoom: '⚠️ 請選擇會議室',

    // Footer messages
    appDescription: '💡 此應用程式是使用 LINE Planet PlanetKit Web SDK 的測試 LIFF 應用程式。',
  },
};

export const getTranslations = (language: Language): Translations => {
  return translations[language];
};

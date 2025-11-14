export enum Tool {
  Chat = 'Chat',
  Image = 'Image',
  Video = 'Video',
  Audio = 'Audio',
  Text = 'Text',
  Translate = 'Translate',
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
  maps?: {
    uri: string;
    title: string;
    placeAnswerSources?: {
      reviewSnippets: {
        uri: string;
        text: string;
      }[];
    }
  };
}
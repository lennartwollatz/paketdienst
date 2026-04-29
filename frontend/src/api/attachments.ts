import api from './client';

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export const attachmentsApi = {
  getForOrder: (orderId: string) =>
    api.get<Attachment[]>(`/attachments/order/${orderId}`),

  /** Lädt die Rohdaten mit Auth-Header und gibt eine Blob-URL zurück */
  getBlobUrl: async (id: string): Promise<string> => {
    const response = await api.get<Blob>(`/attachments/${id}?inline=true`, {
      responseType: 'blob',
    });
    return URL.createObjectURL(response.data);
  },

  /** Startet einen authentifizierten Download */
  download: async (id: string, filename: string): Promise<void> => {
    const response = await api.get<Blob>(`/attachments/${id}`, {
      responseType: 'blob',
    });
    const url = URL.createObjectURL(response.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};

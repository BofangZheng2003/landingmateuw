export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      help_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          request_id: string
          sender_user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          request_id: string
          sender_user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          request_id?: string
          sender_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_messages_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "help_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      help_requests: {
        Row: {
          created_at: string
          helper_hidden: boolean
          helper_user_id: string
          id: string
          mentee_hidden: boolean
          mentee_profile_id: string
          mentee_user_id: string
          rating: number | null
          status: Database["public"]["Enums"]["help_request_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          helper_hidden?: boolean
          helper_user_id: string
          id?: string
          mentee_hidden?: boolean
          mentee_profile_id: string
          mentee_user_id: string
          rating?: number | null
          status?: Database["public"]["Enums"]["help_request_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          helper_hidden?: boolean
          helper_user_id?: string
          id?: string
          mentee_hidden?: boolean
          mentee_profile_id?: string
          mentee_user_id?: string
          rating?: number | null
          status?: Database["public"]["Enums"]["help_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_requests_mentee_profile_id_fkey"
            columns: ["mentee_profile_id"]
            isOneToOne: false
            referencedRelation: "mentee_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mentee_profiles: {
        Row: {
          academic_level: string
          age: number
          country: string
          created_at: string
          id: string
          interest: string
          language: string
          major: string
          needs_help_with: string
          user_id: string | null
        }
        Insert: {
          academic_level: string
          age: number
          country?: string
          created_at?: string
          id?: string
          interest?: string
          language?: string
          major: string
          needs_help_with: string
          user_id?: string | null
        }
        Update: {
          academic_level?: string
          age?: number
          country?: string
          created_at?: string
          id?: string
          interest?: string
          language?: string
          major?: string
          needs_help_with?: string
          user_id?: string | null
        }
        Relationships: []
      }
      posts: {
        Row: {
          content: string | null
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          academic_level: string | null
          age: number | null
          avatar_url: string | null
          bio: string | null
          can_help_with: string | null
          country: string | null
          created_at: string
          display_name: string | null
          helper_availability: string | null
          helper_is_active: boolean
          id: string
          interest: string | null
          language: string | null
          major: string | null
          updated_at: string
        }
        Insert: {
          academic_level?: string | null
          age?: number | null
          avatar_url?: string | null
          bio?: string | null
          can_help_with?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          helper_availability?: string | null
          helper_is_active?: boolean
          id: string
          interest?: string | null
          language?: string | null
          major?: string | null
          updated_at?: string
        }
        Update: {
          academic_level?: string | null
          age?: number | null
          avatar_url?: string | null
          bio?: string | null
          can_help_with?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          helper_availability?: string | null
          helper_is_active?: boolean
          id?: string
          interest?: string | null
          language?: string | null
          major?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      help_request_status:
        | "pending"
        | "accepted"
        | "rejected"
        | "cancelled"
        | "ended"
        | "over"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      help_request_status: [
        "pending",
        "accepted",
        "rejected",
        "cancelled",
        "ended",
        "over",
      ],
    },
  },
} as const

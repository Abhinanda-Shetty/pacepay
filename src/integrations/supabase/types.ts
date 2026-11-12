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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_reviews: {
        Row: {
          confidence: number
          created_at: string
          id: string
          issues: Json
          missing_requirements: Json
          model: string
          project_id: string
          recommendation: string
          requirements_checked: Json
          requirements_satisfied: Json
          submission_id: string
          summary: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          id?: string
          issues?: Json
          missing_requirements?: Json
          model: string
          project_id: string
          recommendation: string
          requirements_checked?: Json
          requirements_satisfied?: Json
          submission_id: string
          summary: string
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          issues?: Json
          missing_requirements?: Json
          model?: string
          project_id?: string
          recommendation?: string
          requirements_checked?: Json
          requirements_satisfied?: Json
          submission_id?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_reviews_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_reviews_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      approvals: {
        Row: {
          approved_by: string
          comments: string
          created_at: string
          id: string
          milestone_id: string
          project_id: string
          status: string
          submission_id: string
        }
        Insert: {
          approved_by: string
          comments?: string
          created_at?: string
          id?: string
          milestone_id: string
          project_id: string
          status: string
          submission_id: string
        }
        Update: {
          approved_by?: string
          comments?: string
          created_at?: string
          id?: string
          milestone_id?: string
          project_id?: string
          status?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          amount: number
          created_at: string
          currency: string
          deadline: string | null
          deliverables: string
          description: string
          id: string
          project_id: string
          requirements: string
          sequence: number
          status: Database["public"]["Enums"]["milestone_status"]
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          deadline?: string | null
          deliverables?: string
          description?: string
          id?: string
          project_id: string
          requirements?: string
          sequence?: number
          status?: Database["public"]["Enums"]["milestone_status"]
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          deadline?: string | null
          deliverables?: string
          description?: string
          id?: string
          project_id?: string
          requirements?: string
          sequence?: number
          status?: Database["public"]["Enums"]["milestone_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          link: string | null
          message: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          milestone_id: string
          payee_id: string | null
          payer_id: string
          paypal_capture_id: string | null
          paypal_order_id: string | null
          project_id: string
          raw: Json | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          milestone_id: string
          payee_id?: string | null
          payer_id: string
          paypal_capture_id?: string | null
          paypal_order_id?: string | null
          project_id: string
          raw?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          milestone_id?: string
          payee_id?: string | null
          payer_id?: string
          paypal_capture_id?: string | null
          paypal_order_id?: string | null
          project_id?: string
          raw?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string
          id: string
          name?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          budget: number
          client_id: string
          created_at: string
          currency: string
          deadline: string | null
          description: string
          freelancer_email: string | null
          freelancer_id: string | null
          id: string
          requirements: string
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          title: string
          updated_at: string
        }
        Insert: {
          budget?: number
          client_id: string
          created_at?: string
          currency?: string
          deadline?: string | null
          description?: string
          freelancer_email?: string | null
          freelancer_id?: string | null
          id?: string
          requirements?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          title: string
          updated_at?: string
        }
        Update: {
          budget?: number
          client_id?: string
          created_at?: string
          currency?: string
          deadline?: string | null
          description?: string
          freelancer_email?: string | null
          freelancer_id?: string | null
          id?: string
          requirements?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      submissions: {
        Row: {
          description: string
          evidence_files: string[]
          evidence_urls: string[]
          id: string
          milestone_id: string
          project_id: string
          submitted_at: string
          submitted_by: string
          version: number
        }
        Insert: {
          description: string
          evidence_files?: string[]
          evidence_urls?: string[]
          id?: string
          milestone_id: string
          project_id: string
          submitted_at?: string
          submitted_by: string
          version?: number
        }
        Update: {
          description?: string
          evidence_files?: string[]
          evidence_urls?: string[]
          id?: string
          milestone_id?: string
          project_id?: string
          submitted_at?: string
          submitted_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "submissions_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_project: { Args: { _project_id: string }; Returns: boolean }
      decide_milestone: {
        Args: { _approve: boolean; _comments: string; _submission_id: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_project_client: { Args: { _project_id: string }; Returns: boolean }
      is_project_freelancer: { Args: { _project_id: string }; Returns: boolean }
      join_project: { Args: { _project_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "client" | "freelancer" | "admin"
      milestone_status:
        | "pending"
        | "in_progress"
        | "submitted"
        | "revision_requested"
        | "approved"
        | "paid"
        | "refunded"
      payment_status:
        | "created"
        | "approved"
        | "completed"
        | "failed"
        | "pending"
        | "cancelled"
        | "refunded"
        | "partially_refunded"
      project_status: "draft" | "active" | "completed" | "cancelled"
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
      app_role: ["client", "freelancer", "admin"],
      milestone_status: [
        "pending",
        "in_progress",
        "submitted",
        "revision_requested",
        "approved",
        "paid",
        "refunded",
      ],
      payment_status: [
        "created",
        "approved",
        "completed",
        "failed",
        "pending",
        "cancelled",
        "refunded",
        "partially_refunded",
      ],
      project_status: ["draft", "active", "completed", "cancelled"],
    },
  },
} as const

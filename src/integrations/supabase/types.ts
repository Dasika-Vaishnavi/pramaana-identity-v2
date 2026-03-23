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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      agent_conversations: {
        Row: {
          agent_response: string
          created_at: string
          id: string
          tools_used: string[] | null
          user_message: string
        }
        Insert: {
          agent_response: string
          created_at?: string
          id?: string
          tools_used?: string[] | null
          user_message: string
        }
        Update: {
          agent_response?: string
          created_at?: string
          id?: string
          tools_used?: string[] | null
          user_message?: string
        }
        Relationships: []
      }
      anonymity_sets: {
        Row: {
          capacity: number
          chain_id: number
          contract_address: string | null
          created_at: string
          current_count: number
          set_id: number
          status: string
        }
        Insert: {
          capacity?: number
          chain_id?: number
          contract_address?: string | null
          created_at?: string
          current_count?: number
          set_id?: number
          status?: string
        }
        Update: {
          capacity?: number
          chain_id?: number
          contract_address?: string | null
          created_at?: string
          current_count?: number
          set_id?: number
          status?: string
        }
        Relationships: []
      }
      chain_configs: {
        Row: {
          chain: string
          chain_id: number
          contract_address: string | null
          created_at: string
          explorer_base_url: string
          is_active: boolean
          rpc_url: string
        }
        Insert: {
          chain: string
          chain_id: number
          contract_address?: string | null
          created_at?: string
          explorer_base_url: string
          is_active?: boolean
          rpc_url: string
        }
        Update: {
          chain?: string
          chain_id?: number
          contract_address?: string | null
          created_at?: string
          explorer_base_url?: string
          is_active?: boolean
          rpc_url?: string
        }
        Relationships: []
      }
      challenges: {
        Row: {
          challenge: string
          created_at: string
          expires_at: string
          id: string
          pseudonym_hash: string
          sp_identifier: string
          used: boolean
        }
        Insert: {
          challenge: string
          created_at?: string
          expires_at?: string
          id?: string
          pseudonym_hash: string
          sp_identifier: string
          used?: boolean
        }
        Update: {
          challenge?: string
          created_at?: string
          expires_at?: string
          id?: string
          pseudonym_hash?: string
          sp_identifier?: string
          used?: boolean
        }
        Relationships: []
      }
      commitments: {
        Row: {
          commitment_c: string
          created_at: string
          ct_size_bytes: number | null
          id: string
          phi_hash: string
          pk_idr: string
          set_id: number | null
          set_index: number
          tx_hash: string | null
        }
        Insert: {
          commitment_c: string
          created_at?: string
          ct_size_bytes?: number | null
          id?: string
          phi_hash: string
          pk_idr: string
          set_id?: number | null
          set_index: number
          tx_hash?: string | null
        }
        Update: {
          commitment_c?: string
          created_at?: string
          ct_size_bytes?: number | null
          id?: string
          phi_hash?: string
          pk_idr?: string
          set_id?: number | null
          set_index?: number
          tx_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commitments_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "anonymity_sets"
            referencedColumns: ["set_id"]
          },
        ]
      }
      enrollment_logs: {
        Row: {
          created_at: string
          id: string
          on_chain_confirmed: boolean
          on_chain_tx_hash: string | null
          palc_encrypt_ms: number | null
          palc_hash_ms: number | null
          palc_hkdf_ms: number | null
          palc_keygen_ms: number | null
          palc_total_ms: number | null
          phi_hash: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          on_chain_confirmed?: boolean
          on_chain_tx_hash?: string | null
          palc_encrypt_ms?: number | null
          palc_hash_ms?: number | null
          palc_hkdf_ms?: number | null
          palc_keygen_ms?: number | null
          palc_total_ms?: number | null
          phi_hash?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          on_chain_confirmed?: boolean
          on_chain_tx_hash?: string | null
          palc_encrypt_ms?: number | null
          palc_hash_ms?: number | null
          palc_hkdf_ms?: number | null
          palc_keygen_ms?: number | null
          palc_total_ms?: number | null
          phi_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_logs_phi_hash_fkey"
            columns: ["phi_hash"]
            isOneToOne: false
            referencedRelation: "commitments"
            referencedColumns: ["phi_hash"]
          },
        ]
      }
      merkle_roots: {
        Row: {
          computed_at: string
          id: string
          leaf_count: number
          root_hash: string
          set_id: number
        }
        Insert: {
          computed_at?: string
          id?: string
          leaf_count?: number
          root_hash: string
          set_id: number
        }
        Update: {
          computed_at?: string
          id?: string
          leaf_count?: number
          root_hash?: string
          set_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "merkle_roots_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "anonymity_sets"
            referencedColumns: ["set_id"]
          },
        ]
      }
      multichain_registrations: {
        Row: {
          block_number: number | null
          chain: string
          confirmed: boolean
          contract_address: string | null
          created_at: string
          id: string
          phi_hash: string
          tx_hash: string | null
        }
        Insert: {
          block_number?: number | null
          chain: string
          confirmed?: boolean
          contract_address?: string | null
          created_at?: string
          id?: string
          phi_hash: string
          tx_hash?: string | null
        }
        Update: {
          block_number?: number | null
          chain?: string
          confirmed?: boolean
          contract_address?: string | null
          created_at?: string
          id?: string
          phi_hash?: string
          tx_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "multichain_registrations_chain_fkey"
            columns: ["chain"]
            isOneToOne: false
            referencedRelation: "chain_configs"
            referencedColumns: ["chain"]
          },
        ]
      }
      nullifier_registry: {
        Row: {
          created_at: string
          id: string
          nullifier: string
          proof_pi: string
          pseudonym_hash: string
          set_id: number | null
          sp_identifier: string
        }
        Insert: {
          created_at?: string
          id?: string
          nullifier: string
          proof_pi: string
          pseudonym_hash: string
          set_id?: number | null
          sp_identifier: string
        }
        Update: {
          created_at?: string
          id?: string
          nullifier?: string
          proof_pi?: string
          pseudonym_hash?: string
          set_id?: number | null
          sp_identifier?: string
        }
        Relationships: [
          {
            foreignKeyName: "nullifier_registry_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "anonymity_sets"
            referencedColumns: ["set_id"]
          },
        ]
      }
      service_providers: {
        Row: {
          created_at: string
          credential_type: string
          identifier: string
          name: string
          origin: string
          sp_id: string
        }
        Insert: {
          created_at?: string
          credential_type?: string
          identifier: string
          name: string
          origin: string
          sp_id?: string
        }
        Update: {
          created_at?: string
          credential_type?: string
          identifier?: string
          name?: string
          origin?: string
          sp_id?: string
        }
        Relationships: []
      }
      wallet_analyses: {
        Row: {
          analyzed_at: string
          balance_wei: string | null
          chain_id: number | null
          id: string
          outbound_tx_count: number | null
          phi_hash: string | null
          pramaana_enrolled: boolean | null
          pubkey_exposures: number | null
          quantum_risk: string | null
          risk_score: number | null
          sybil_indicators: Json | null
          sybil_score: number | null
          tx_count: number | null
          wallet_address: string
        }
        Insert: {
          analyzed_at?: string
          balance_wei?: string | null
          chain_id?: number | null
          id?: string
          outbound_tx_count?: number | null
          phi_hash?: string | null
          pramaana_enrolled?: boolean | null
          pubkey_exposures?: number | null
          quantum_risk?: string | null
          risk_score?: number | null
          sybil_indicators?: Json | null
          sybil_score?: number | null
          tx_count?: number | null
          wallet_address: string
        }
        Update: {
          analyzed_at?: string
          balance_wei?: string | null
          chain_id?: number | null
          id?: string
          outbound_tx_count?: number | null
          phi_hash?: string | null
          pramaana_enrolled?: boolean | null
          pubkey_exposures?: number | null
          quantum_risk?: string | null
          risk_score?: number | null
          sybil_indicators?: Json | null
          sybil_score?: number | null
          tx_count?: number | null
          wallet_address?: string
        }
        Relationships: []
      }
      wallet_bindings: {
        Row: {
          bound_at: string
          chain_id: number
          id: string
          phi_hash: string
          signature: string | null
          wallet_address: string
        }
        Insert: {
          bound_at?: string
          chain_id?: number
          id?: string
          phi_hash: string
          signature?: string | null
          wallet_address: string
        }
        Update: {
          bound_at?: string
          chain_id?: number
          id?: string
          phi_hash?: string
          signature?: string | null
          wallet_address?: string
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
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

import { gql } from "./fake-apollo.js";

/** Client documents — named ops for the Notes API story. */
export const ListNotes = gql`
  query ListNotes {
    notes {
      id
      title
    }
  }
`;

export const GetNote = gql`
  query GetNote($id: ID!) {
    note(id: $id) {
      id
      title
      body
    }
  }
`;

export const CreateNote = gql`
  mutation CreateNote($title: String!, $body: String) {
    createNote(title: $title, body: $body) {
      id
      title
    }
  }
`;

export const DeleteNote = gql`
  mutation DeleteNote($id: ID!) {
    deleteNote(id: $id)
  }
`;

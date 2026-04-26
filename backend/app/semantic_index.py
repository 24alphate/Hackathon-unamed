"""SentenceTransformers + Chroma semantic similarity helper."""
from __future__ import annotations

import hashlib
from typing import Any

from .config import CHROMA_PATH, EMBEDDING_MODEL

_collection = None
_model = None


def _get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer

        _model = SentenceTransformer(EMBEDDING_MODEL)
    return _model


def _get_collection():
    global _collection
    if _collection is None:
        import chromadb

        client = chromadb.PersistentClient(path=CHROMA_PATH)
        _collection = client.get_or_create_collection(
            "unmapped_semantic_profiles",
            metadata={"hnsw:space": "cosine"},
        )
    return _collection


def _id_for(kind: str, text: str) -> str:
    h = hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]
    return f"{kind}_{h}"


def semantic_similarity(job_text: str, profile_text: str, candidate_key: str = "candidate") -> float:
    """Returns 0..100 semantic similarity score."""
    if not (job_text or "").strip() or not (profile_text or "").strip():
        return 0.0
    model = _get_model()
    col = _get_collection()

    emb_job = model.encode([job_text], normalize_embeddings=True)[0].tolist()
    emb_profile = model.encode([profile_text], normalize_embeddings=True)[0].tolist()
    job_id = _id_for("job", job_text)
    profile_id = _id_for(f"profile_{candidate_key}", profile_text)
    col.upsert(
        ids=[job_id, profile_id],
        embeddings=[emb_job, emb_profile],
        documents=[job_text, profile_text],
        metadatas=[{"kind": "job"}, {"kind": "profile", "candidate": candidate_key}],
    )
    q = col.query(
        query_embeddings=[emb_job],
        n_results=3,
        where={"kind": "profile"},
        include=["distances", "ids"],
    )
    distances = (q.get("distances") or [[]])[0]
    ids = (q.get("ids") or [[]])[0]
    if not distances:
        return 0.0
    # cosine distance in [0,2], with 0 best
    best_distance = None
    for pid, dist in zip(ids, distances, strict=False):
        if pid == profile_id:
            best_distance = float(dist)
            break
    if best_distance is None:
        best_distance = float(distances[0])
    sim = max(0.0, min(1.0, 1.0 - best_distance))
    return round(sim * 100, 2)

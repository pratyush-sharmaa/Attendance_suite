import os
os.environ['OMP_NUM_THREADS'] = '1'

_model = None

def get_model():
    global _model
    if _model is None:
        import insightface
        _model = insightface.app.FaceAnalysis(
            name='buffalo_s',
            providers=['CPUExecutionProvider']
        )
        _model.prepare(ctx_id=0, det_size=(320, 320))
    return _model